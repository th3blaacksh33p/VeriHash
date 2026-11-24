/*
 * VeriHash Standalone Cross-Platform Server (C99 + Mongoose)
 * Serves either embedded dist/ assets (default standalone binary mode)
 * or a live dist/ directory on disk (--dir <path>), plus /api/version
 * so connected browsers can detect updated server builds.
 */

#ifndef _WIN32
#define _POSIX_C_SOURCE 200809L
#endif

#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>
#endif

#include "mongoose.h"

#ifdef VERIHASH_EMBEDDED_ASSETS
#include "embedded_assets.h"
#else
#define VERIHASH_APP_VERSION "1.0.0"
#define VERIHASH_BUILD_ID "disk-dev"
#define VERIHASH_BUILT_AT "live-filesystem"
#endif

typedef struct {
  const char *root_dir;
  int use_disk_dir;
  char index_fallback_path[512];
} VerihashServerConfig;

static volatile sig_atomic_t g_running = 1;

#ifdef _WIN32
static BOOL WINAPI console_ctrl_handler(DWORD ctrl_type) {
  (void)ctrl_type;
  g_running = 0;
  return TRUE;
}
#else
static void posix_signal_handler(int sig) {
  (void)sig;
  g_running = 0;
}
#endif

static void print_usage(const char *prog) {
  printf(
    "VeriHash Standalone Server v%s (build %s)\n"
    "\n"
    "Usage:\n"
    "  %s [options]\n"
    "\n"
    "Options:\n"
    "  --port <0-65535>   TCP port to bind (default: 0, auto-assign free port)\n"
    "  --host <ipv4>      IPv4 interface to bind (default: 127.0.0.1)\n"
    "  --dir <path>       Serve dist/ from disk instead of embedded assets\n"
    "  --no-open          Do not automatically launch the default browser\n"
    "  -h, --help         Show this help message\n"
    "  -v, --version      Show version and build ID\n",
    VERIHASH_APP_VERSION,
    VERIHASH_BUILD_ID,
    prog
  );
}

static int parse_port(const char *str, int *out_port) {
  char *end = NULL;
  long val;
  if (!str || str[0] == '\0') return -1;
  errno = 0;
  val = strtol(str, &end, 10);
  if (errno != 0 || end == str || *end != '\0' || val < 0 || val > 65535) {
    return -1;
  }
  *out_port = (int)val;
  return 0;
}

static int etag_matches(struct mg_http_message *hm, const char *build_id) {
  struct mg_str *hdr = mg_http_get_header(hm, "If-None-Match");
  char quoted[64];
  if (!hdr || hdr->len == 0) return 0;
  snprintf(quoted, sizeof(quoted), "\"%s\"", build_id);
  if (mg_strcmp(*hdr, mg_str(quoted)) == 0) return 1;
  if (mg_strcmp(*hdr, mg_str(build_id)) == 0) return 1;
  return 0;
}

static int has_dotdot_segment(const char *path) {
  const char *p = path;
  while (*p != '\0') {
    if (p[0] == '.' && p[1] == '.' &&
        (p[2] == '/' || p[2] == '\\' || p[2] == '\0')) {
      return 1;
    }
    while (*p != '\0' && *p != '/' && *p != '\\') {
      p++;
    }
    if (*p != '\0') {
      p++;
    }
  }
  return 0;
}

#ifdef VERIHASH_EMBEDDED_ASSETS
static const VerihashAsset *find_embedded_asset(const char *path) {
  size_t i;
  for (i = 0; i < VERIHASH_ASSET_COUNT; i++) {
    if (strcmp(VERIHASH_ASSETS[i].path, path) == 0) {
      return &VERIHASH_ASSETS[i];
    }
  }
  return NULL;
}

static int looks_like_static_asset_request(const char *path) {
  const char *last_slash = strrchr(path, '/');
  const char *last_dot = strrchr(path, '.');
  if (strncmp(path, "/assets/", 8) == 0) return 1;
  if (last_dot && (!last_slash || last_dot > last_slash)) return 1;
  return 0;
}

static void serve_embedded_asset(
  struct mg_connection *c,
  struct mg_http_message *hm,
  int is_head
) {
  char uri_buf[1024];
  const char *lookup_path;
  const VerihashAsset *asset;
  size_t copy_len = hm->uri.len;

  if (copy_len >= sizeof(uri_buf)) {
    mg_http_reply(c, 414, "Content-Type: text/plain\r\n", "URI Too Long\n");
    return;
  }
  memcpy(uri_buf, hm->uri.buf, copy_len);
  uri_buf[copy_len] = '\0';

  if (uri_buf[0] != '/' || has_dotdot_segment(uri_buf)) {
    mg_http_reply(c, 400, "Content-Type: text/plain\r\n", "Bad Request\n");
    return;
  }

  lookup_path = (strcmp(uri_buf, "/") == 0) ? "/index.html" : uri_buf;
  asset = find_embedded_asset(lookup_path);

  if (!asset && !looks_like_static_asset_request(lookup_path)) {
    asset = find_embedded_asset("/index.html");
  }

  if (!asset) {
    mg_http_reply(c, 404, "Content-Type: text/plain\r\n", "404 Not Found\n");
    return;
  }

  if (etag_matches(hm, VERIHASH_BUILD_ID)) {
    mg_printf(
      c,
      "HTTP/1.1 304 Not Modified\r\n"
      "ETag: \"%s\"\r\n"
      "Cache-Control: %s\r\n"
      "X-Content-Type-Options: nosniff\r\n"
      "Connection: close\r\n"
      "\r\n",
      VERIHASH_BUILD_ID,
      asset->immutable ? "public, max-age=31536000, immutable" : "no-cache"
    );
    return;
  }

  mg_printf(
    c,
    "HTTP/1.1 200 OK\r\n"
    "Content-Type: %s\r\n"
    "Content-Length: %lu\r\n"
    "ETag: \"%s\"\r\n"
    "Cache-Control: %s\r\n"
    "X-Content-Type-Options: nosniff\r\n"
    "Connection: close\r\n"
    "\r\n",
    asset->mime_type,
    (unsigned long)asset->length,
    VERIHASH_BUILD_ID,
    asset->immutable ? "public, max-age=31536000, immutable" : "no-cache"
  );

  if (!is_head && asset->length > 0) {
    mg_send(c, asset->data, asset->length);
  }
}
#endif

static void handle_version_endpoint(
  struct mg_connection *c,
  struct mg_http_message *hm,
  const VerihashServerConfig *cfg
) {
  const char *mode = cfg->use_disk_dir ? "directory" : "embedded";
#ifdef VERIHASH_EMBEDDED_ASSETS
  unsigned asset_count = cfg->use_disk_dir ? 0u : VERIHASH_ASSET_COUNT;
#else
  unsigned asset_count = 0u;
#endif

  if (etag_matches(hm, VERIHASH_BUILD_ID)) {
    mg_printf(
      c,
      "HTTP/1.1 304 Not Modified\r\n"
      "ETag: \"%s\"\r\n"
      "Cache-Control: no-store\r\n"
      "X-Content-Type-Options: nosniff\r\n"
      "Connection: close\r\n"
      "\r\n",
      VERIHASH_BUILD_ID
    );
    return;
  }

  mg_http_reply(
    c,
    200,
    "Content-Type: application/json; charset=utf-8\r\n"
    "Cache-Control: no-store\r\n"
    "X-Content-Type-Options: nosniff\r\n"
    "ETag: \"" VERIHASH_BUILD_ID "\"\r\n",
    "{\"name\":\"verihash\",\"version\":\"%s\",\"buildId\":\"%s\",\"builtAt\":\"%s\","
    "\"mode\":\"%s\",\"embeddedAssets\":%u}\n",
    VERIHASH_APP_VERSION,
    VERIHASH_BUILD_ID,
    VERIHASH_BUILT_AT,
    mode,
    asset_count
  );
}

static void ev_handler(struct mg_connection *c, int ev, void *ev_data) {
  if (ev == MG_EV_HTTP_MSG) {
    struct mg_http_message *hm = (struct mg_http_message *)ev_data;
    const VerihashServerConfig *cfg = (const VerihashServerConfig *)c->fn_data;
    int is_get = mg_strcasecmp(hm->method, mg_str("GET")) == 0;
    int is_head = mg_strcasecmp(hm->method, mg_str("HEAD")) == 0;

    if (!is_get && !is_head) {
      mg_http_reply(c, 405, "Content-Type: text/plain\r\n", "405 Method Not Allowed\n");
      return;
    }

    if (mg_match(hm->uri, mg_str("/api/version"), NULL)) {
      handle_version_endpoint(c, hm, cfg);
      return;
    }

    if (mg_match(hm->uri, mg_str("/api/health"), NULL)) {
      mg_http_reply(
        c,
        200,
        "Content-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\n",
        "{\"status\":\"ok\",\"version\":\"%s\",\"buildId\":\"%s\"}\n",
        VERIHASH_APP_VERSION,
        VERIHASH_BUILD_ID
      );
      return;
    }

#ifdef VERIHASH_EMBEDDED_ASSETS
    if (!cfg->use_disk_dir) {
      serve_embedded_asset(c, hm, is_head);
      return;
    }
#endif

    {
      struct mg_http_serve_opts opts;
      memset(&opts, 0, sizeof(opts));
      opts.root_dir = cfg->root_dir;
      opts.extra_headers = "X-Content-Type-Options: nosniff\r\n";
      opts.page404 = cfg->index_fallback_path;
      mg_http_serve_dir(c, hm, &opts);
    }
  }
}

static void launch_browser(const char *url) {
#ifdef _WIN32
  char cmdline[256];
  STARTUPINFOA si;
  PROCESS_INFORMATION pi;
  memset(&si, 0, sizeof(si));
  si.cb = sizeof(si);
  memset(&pi, 0, sizeof(pi));
  snprintf(cmdline, sizeof(cmdline), "cmd.exe /c start \"\" \"%s\"", url);
  if (CreateProcessA(NULL, cmdline, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
  }
#else
  pid_t pid = fork();
  if (pid == 0) {
    int devnull = open("/dev/null", O_RDWR);
    if (devnull >= 0) {
      (void)dup2(devnull, STDOUT_FILENO);
      (void)dup2(devnull, STDERR_FILENO);
      close(devnull);
    }
#ifdef __APPLE__
    execlp("open", "open", url, (char *)NULL);
#else
    execlp("xdg-open", "xdg-open", url, (char *)NULL);
#endif
    _exit(127);
  }
#endif
}

int main(int argc, char **argv) {
  int requested_port = 0;
  const char *host = "127.0.0.1";
  int open_browser = 1;
  int i;

  VerihashServerConfig cfg;
  struct mg_mgr mgr;
  struct mg_connection *listener;
  struct mg_addr parsed_host;
  char listen_url[128];
  char browser_url[128];
  uint16_t bound_port;

  memset(&cfg, 0, sizeof(cfg));
  cfg.root_dir = "dist";
#ifdef VERIHASH_EMBEDDED_ASSETS
  cfg.use_disk_dir = 0;
#else
  cfg.use_disk_dir = 1;
#endif

  for (i = 1; i < argc; i++) {
    if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
      print_usage(argv[0]);
      return 0;
    } else if (strcmp(argv[i], "-v") == 0 || strcmp(argv[i], "--version") == 0) {
      printf("VeriHash Standalone v%s (build %s)\n", VERIHASH_APP_VERSION, VERIHASH_BUILD_ID);
      return 0;
    } else if (strcmp(argv[i], "--no-open") == 0) {
      open_browser = 0;
    } else if (strcmp(argv[i], "--port") == 0) {
      if (i + 1 >= argc || parse_port(argv[++i], &requested_port) != 0) {
        fprintf(stderr, "Error: --port requires an integer between 0 and 65535.\n");
        return 1;
      }
    } else if (strcmp(argv[i], "--host") == 0) {
      if (i + 1 >= argc) {
        fprintf(stderr, "Error: --host requires an IPv4 address.\n");
        return 1;
      }
      host = argv[++i];
    } else if (strcmp(argv[i], "--dir") == 0) {
      if (i + 1 >= argc) {
        fprintf(stderr, "Error: --dir requires a directory path.\n");
        return 1;
      }
      cfg.root_dir = argv[++i];
      cfg.use_disk_dir = 1;
    } else {
      fprintf(stderr, "Unknown option: %s\nUse --help for usage.\n", argv[i]);
      return 1;
    }
  }

  if (!mg_aton(mg_str(host), &parsed_host)) {
    fprintf(stderr, "Error: Invalid IP address '%s'.\n", host);
    return 1;
  }

  snprintf(
    cfg.index_fallback_path,
    sizeof(cfg.index_fallback_path),
    "%s/index.html",
    cfg.root_dir
  );

#ifdef _WIN32
  SetConsoleCtrlHandler(console_ctrl_handler, TRUE);
#else
  {
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = posix_signal_handler;
    sigemptyset(&sa.sa_mask);
    (void)sigaction(SIGINT, &sa, NULL);
    (void)sigaction(SIGTERM, &sa, NULL);
    (void)signal(SIGPIPE, SIG_IGN);
  }
#endif

  mg_log_set(MG_LL_ERROR);
  mg_mgr_init(&mgr);

  snprintf(listen_url, sizeof(listen_url), "http://%s:%d", host, requested_port);
  listener = mg_http_listen(&mgr, listen_url, ev_handler, &cfg);
  if (!listener) {
    fprintf(stderr, "Error: Unable to bind %s\n", listen_url);
    mg_mgr_free(&mgr);
    return 1;
  }

  bound_port = mg_ntohs(listener->loc.port);
  snprintf(
    browser_url,
    sizeof(browser_url),
    "http://%s:%u/",
    (strcmp(host, "0.0.0.0") == 0) ? "127.0.0.1" : host,
    (unsigned)bound_port
  );

  printf("VeriHash Standalone Server v%s (build %s)\n", VERIHASH_APP_VERSION, VERIHASH_BUILD_ID);
#ifdef VERIHASH_EMBEDDED_ASSETS
  if (!cfg.use_disk_dir) {
    printf("Serving %u embedded assets on %s\n", VERIHASH_ASSET_COUNT, browser_url);
  } else {
    printf("Serving directory '%s' on %s\n", cfg.root_dir, browser_url);
  }
#else
  printf("Serving directory '%s' on %s\n", cfg.root_dir, browser_url);
#endif
  printf("Version check endpoint: %sapi/version\n", browser_url);
  printf("Press Ctrl+C to stop.\n");
  fflush(stdout);

  if (open_browser) {
    launch_browser(browser_url);
  }

  while (g_running) {
#ifndef _WIN32
    while (waitpid(-1, NULL, WNOHANG) > 0) {
      /* Reap browser launcher child processes */
    }
#endif
    mg_mgr_poll(&mgr, 200);
  }

  printf("\nShutting down VeriHash server.\n");
  mg_mgr_free(&mgr);
  return 0;
}

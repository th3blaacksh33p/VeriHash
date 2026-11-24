.PHONY: all assets native cross-windows cross-all clean

all: native

assets:
	npm run build
	node scripts/pack-c-assets.mjs

native:
	bash scripts/build.sh --target native

cross-windows:
	bash scripts/build.sh --target windows-amd64

cross-all:
	bash scripts/build.sh --target all

clean:
	rm -rf dist-native src/native/embedded_assets.h

VERSION := $(shell bun -e "console.log(require('./package.json').version)")

.PHONY: all build build-chrome build-firefox zip zip-chrome zip-firefox pre test lint clean help

all: build

help:
	@echo "WebRoom Management Commands:"
	@echo "  make build       - Build both Chrome and Firefox extension targets"
	@echo "  make zip         - Build and create release zips for Chrome and Firefox"
	@echo "  make pre         - Build and output unpacked folders (v$(VERSION)_chrome and v$(VERSION)_firefox)"
	@echo "  make test        - Run test suite"
	@echo "  make lint        - Run Firefox web-ext linter"
	@echo "  make clean       - Clean temporary build outputs and archives"

build: build-chrome build-firefox

build-chrome:
	bun run build:chrome

build-firefox:
	bun run build:firefox

zip:
	bun run zip:all

zip-chrome:
	bun run zip:chrome

zip-firefox:
	bun run zip:firefox

pre:
	@echo "\n[WebRoom Pre] Generating unpacked extension directories for version $(VERSION)..."
	rm -rf dist v$(VERSION)_chrome v$(VERSION)_firefox
	@echo "\n[WebRoom Pre] Building Chrome unpacked directory..."
	bun run build:chrome
	cp -r dist v$(VERSION)_chrome
	rm -rf dist
	@echo "\n[WebRoom Pre] Building Firefox unpacked directory..."
	bun run build:firefox
	cp -r dist v$(VERSION)_firefox
	rm -rf dist
	@echo "\n[WebRoom Pre] Successfully created unpacked preview directories:"
	@echo "  📁 v$(VERSION)_chrome"
	@echo "  📁 v$(VERSION)_firefox\n"

test:
	bun test

lint:
	bun run lint:firefox

clean:
	rm -rf dist v*_chrome v*_firefox *.zip

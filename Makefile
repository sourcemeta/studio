NPM = npm
NPX = npx
CODE = code
INSTALL = install
UNZIP = unzip
MKDIR = mkdir

all: webview vscode vscode-test vscode-package

webview: .always
	cd webview && $(NPM) ci
	cd webview && $(NPM) run lint
	cd webview && $(NPM) run build

vscode: .always
	cd vscode && $(NPM) ci
	$(MKDIR) -p build/vscode
	$(INSTALL) -m 0664 README.markdown build/vscode/README.md
	$(INSTALL) -m 0664 screenshot.png build/vscode/screenshot.png
	$(INSTALL) -m 0664 instructions.png build/vscode/instructions.png
	$(INSTALL) -m 0664 LICENSE build/vscode/LICENSE
	$(INSTALL) -m 0664 build/webview/index.html build/vscode/index.html
	$(INSTALL) -m 0664 vscode/logo.png build/vscode/logo.png
	$(INSTALL) -m 0664 vscode/index.js build/vscode/index.js
	$(INSTALL) -m 0664 vscode/package.json build/vscode/package.json
	$(INSTALL) -m 0664 vscode/package-lock.json build/vscode/package-lock.json
	cd build/vscode && $(NPM) ci

vscode-test: .always
	cd test/vscode && $(NPM) ci
	cd test/vscode && $(NPM) test

vscode-package: .always
	$(MKDIR) -p build/dist
	cd build/vscode && $(NPM) ci
	cd build/vscode && $(NPX) --yes vsce package --out ../dist/sourcemeta-studio-vscode.vsix
	$(UNZIP) -l build/dist/*.vsix

vscode-open: vscode
	$(CODE) --extensionDevelopmentPath="$(PWD)/vscode"

.always:

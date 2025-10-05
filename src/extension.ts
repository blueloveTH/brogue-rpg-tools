import * as vscode from 'vscode';
import { CssDocumentColorProvider, RGBADocumentColorProvider, RGBDocumentColorProvider } from './colorProviders';
import { previewFormula, documentCaches } from './formulas';

let decorationType: vscode.TextEditorDecorationType;

function findAllFormulaPositions(text: string): Array<{ start: number, end: number }> {
	const results: Array<{ start: number, end: number }> = [];
	const regex = /\bformula\(/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		let startIdx = match.index;
		let currentIdx = regex.lastIndex;
		let openParens = 1;

		while (currentIdx < text.length && openParens > 0) {
			const char = text[currentIdx];
			if (char === '(') openParens++;
			else if (char === ')') openParens--;
			currentIdx++;
		}

		if (openParens === 0) {
			if (currentIdx === text.length || text[currentIdx] !== ':') {
				results.push({
					start: startIdx + 'formula('.length,
					end: currentIdx - 1,
				});
			}
		}
	}

	return results;
}

export function activate(context: vscode.ExtensionContext) {
	decorationType = vscode.window.createTextEditorDecorationType({
		textDecoration: 'underline gray'
	});

	context.subscriptions.push(
		vscode.languages.registerHoverProvider('python', {
			provideHover(document, position, token) {
				const cachedData = documentCaches.get(document.uri.toString());
				if (!cachedData) return null;
				for (const range of cachedData.ranges) {
					if (range.contains(position)) {
						const text = document.getText(range);
						const markdown = new vscode.MarkdownString();
						markdown.appendCodeblock(previewFormula(text, cachedData), 'plaintext');
						return new vscode.Hover(markdown);
					}
				}
				return null;
			}
		}),
		// 监听文档变化
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId === 'python') {
				triggerUpdateDecorations(event.document);
			}
		}),	// 当切换编辑器时重新装饰
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor && editor.document.languageId === 'python') {
				triggerUpdateDecorations(editor.document);
			}
		}),	// 清理关闭的文档数据
		vscode.workspace.onDidCloseTextDocument(doc => {
			documentCaches.delete(doc.uri.toString());
		}),
		// 添加颜色选择器
		vscode.languages.registerColorProvider('python', new RGBADocumentColorProvider()),
		vscode.languages.registerColorProvider('python', new RGBDocumentColorProvider()),
		vscode.languages.registerColorProvider('json', new CssDocumentColorProvider()),
		vscode.languages.registerColorProvider('csv', new CssDocumentColorProvider()),
	);

	// 初始装饰
	if (vscode.window.activeTextEditor) {
		triggerUpdateDecorations(vscode.window.activeTextEditor.document);
	}
}

function triggerUpdateDecorations(document: vscode.TextDocument) {
	const editor = vscode.window.visibleTextEditors.find(e => e.document === document);
	if (!editor || document.languageId !== 'python') return;

	const text = document.getText();
	const positions = findAllFormulaPositions(text);
	const ranges = positions.map(pos => {
		const startPos = document.positionAt(pos.start);
		const endPos = document.positionAt(pos.end);
		return new vscode.Range(startPos, endPos);
	});

	// # level = range(1, 10, 2)
	// # atk = range(5, 6)
	const formulaConfigRegex = /#\s*([a-zA-Z_0-9\.\[\]]+)\s*=\s*range\(\s*(-?\d+)\s*,\s*(-?\d+)(?:\s*,\s*(-?\d+))?\s*\)/g;
	let match: RegExpExecArray | null;
	const formulaConfig: Map<string, { start: number; end: number; step: number }> = new Map();
	while ((match = formulaConfigRegex.exec(text)) !== null) {
		const varName = match[1];
		const start = parseInt(match[2]);
		const end = parseInt(match[3]);
		const step = match[4] ? parseInt(match[4]) : 1;
		console.log(`配置变量: ${varName}: start=${start}, end=${end}, step=${step}`);
		formulaConfig.set(varName, { start, end, step });
	}

	documentCaches.set(document.uri.toString(), {
		ranges,
		formulaConfig
	});
	editor.setDecorations(decorationType, ranges);
}

export function deactivate() {
	if (decorationType) {
		decorationType.dispose();
	}
	documentCaches.clear();
}

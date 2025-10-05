import * as vscode from 'vscode';
import { CssDocumentColorProvider, RGBADocumentColorProvider, RGBDocumentColorProvider } from './colorProviders';
import { previewFormula } from './formulas';

let decorationType: vscode.TextEditorDecorationType;

const formulaRangesMap: Map<string, vscode.Range[]> = new Map();

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
				const ranges = formulaRangesMap.get(document.uri.toString());
				if (!ranges) return null;
				for (const range of ranges) {
					if (range.contains(position)) {
						const text = document.getText(range);
						const markdown = new vscode.MarkdownString();
						markdown.appendCodeblock(previewFormula(text), 'plaintext');
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
			formulaRangesMap.delete(doc.uri.toString());
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

	formulaRangesMap.set(document.uri.toString(), ranges);
	editor.setDecorations(decorationType, ranges);
}

export function deactivate() {
	if (decorationType) {
		decorationType.dispose();
	}
	formulaRangesMap.clear();
}

import * as vscode from 'vscode';
import { JSAsciiTable } from './js-ascii-table.js';
import { ExpressionParser, unpackArgs } from 'expressionparser'

export interface CachedData {
    ranges: vscode.Range[];
    formulaConfig: Map<string, {
        start: number;
        end: number;
        step: number;
    }>;
}
export const documentCaches: Map<string, CachedData> = new Map();

function buildParser(globals: any) {
    const arithmeticLanguage = {
        INFIX_OPS: {
            '+': function (a: any, b: any) {
                return a() + b();
            },
            '-': function (a: any, b: any) {
                return a() - b();
            },
            '*': function (a: any, b: any) {
                return a() * b();
            },
            '/': function (a: any, b: any) {
                return a() / b();
            },
            '//': function (a: any, b: any) {
                return Math.floor(a() / b());
            },
            '%': function (a: any, b: any) {
                return a() % b();
            },
            '**': function (a: any, b: any) {
                return a() ** b();
            }
        },
        PREFIX_OPS: {
            'math.log': function (a: any) {
                return Math.log(a());
            },
            'int': function (a: any) {
                return Math.floor(a());
            },
            'round': function (a: any) {
                return Math.round(a());
            },
        },
        PRECEDENCE: [['**'], ['*', '/', '//', '%'], ['+', '-']],
        GROUP_OPEN: '(',
        GROUP_CLOSE: ')',
        SEPARATORS: [','],
        WHITESPACE_CHARS: [" "],
        SYMBOLS: ['(', ')', '+', '-', '*', '/', '//', '%', '**', ','],
        AMBIGUOUS: {},
        ESCAPE_CHAR: '\\',
        LITERAL_OPEN: '"',
        LITERAL_CLOSE: '"',
        termDelegate: function (term: string) {
            if (term === 'x') return globals.x;
            if (term === 'y') return globals.y;
            return Number(term);
        },
    };
    return new ExpressionParser(arithmeticLanguage);
}

function extractVariables(expr: string): string[] {
    const variables: Set<string> = new Set();

    // 匹配变量名：支持 a、a.b、a[0]、a[0].x 等
    const variableRegex = /[a-zA-Z_]\w*(?:\[\d+\])*(?:\.\w+)?/g;

    const disallowedNames = new Set(['int', 'round']);

    let match: RegExpExecArray | null;
    while ((match = variableRegex.exec(expr)) !== null) {
        const varName = match[0];
        if (varName.startsWith('math.')) continue;
        if (disallowedNames.has(varName)) continue;
        const start = match.index;
        const end = start + varName.length;

        // 排除数字、保留变量名
        if (!/^\d+$/.test(varName)) {
            variables.add(varName);
        }
    }
    return Array.from(variables);
}

function replaceAllFromDict(formula: string, dict: { [key: string]: string }): string {
    // 遍历字典中的每一个键值对
    for (const [key, value] of Object.entries(dict)) {
        // 创建一个全局正则表达式，转义特殊字符
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedKey, 'g');
        formula = formula.replace(regex, value);
    }
    return formula;
}

export function previewFormula(formula: string, cachedData: CachedData): string {
    // 提取变量及其位置
    const variables = extractVariables(formula);
    console.log('提取的变量:', variables);
    // 最多2个变量
    if (variables.length > 2) {
        return `🔍 公式中的变量数不能超过2个`;
    }
    // 返回新公式，第一个变量替换为 x，第二个变量替换为 y
    // 用regex来替换
    let newFormula = replaceAllFromDict(formula, {
        [variables[0]]: 'x',
        [variables[1] || '?']: 'y'
    });
    console.log(newFormula);

    function getValues(varName: string): number[] {
        if (Map.prototype.has.call(cachedData.formulaConfig, varName)) {
            const config = cachedData.formulaConfig.get(varName)!;
            const values = [];
            for (let v = config.start; v < config.end; v += config.step) {
                values.push(v);
            }
            return values;
        } else {
            return Array.from({ length: 11 }, (_, i) => i);
        }
    }

    let xValues: number[] = getValues(variables[0]);
    let yValues: number[] = variables.length > 1 ? getValues(variables[1]) : [0];
    console.log('xValues:', xValues);
    console.log('yValues:', yValues);

    // 构建一个二维数组
    const data: string[][] = [];
    const leftTop = variables[0] + (variables[1] ? `/${variables[1]}` : '');
    data.push([leftTop, ...yValues.map(v => v.toString())]);

    const globals: any = { x: 0, y: 0 };
    const parser = buildParser(globals);

    for (const x of xValues) {
        const row: string[] = [x.toString()];
        for (const y of yValues) {
            globals.x = x;
            globals.y = y;

            try {
                const result = parser.expressionToValue(newFormula);
                row.push(result.toString());
            } catch (e) {
                console.error('计算公式出错:', e);
                row.push('-');
            }
        }
        data.push(row);
    }
    const options = {
        spreadsheet: false,  // Spreadsheet type 
        header: true, // Use first row as a header
        align: false, // Align numeric values to the right
        padding: 1, // Padding
    }
    return new JSAsciiTable(data, options).render();
}

import { JSAsciiTable } from './js-ascii-table.js';


function extractVariables(expr: string): string[] {
    const variables: Set<string> = new Set();

    // 匹配变量名：支持 a、a.b、a[0]、a[0].x 等
    const variableRegex = /[a-zA-Z_]\w*(?:\[\d+\])*(?:\.\w+)?/g;

    let match: RegExpExecArray | null;
    while ((match = variableRegex.exec(expr)) !== null) {
        const varName = match[0];
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

export function previewFormula(formula: string): string {
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
    // x和y分别取值0-10
    const xValues = Array.from({ length: 11 }, (_, i) => i);
    let yValues = Array.from({ length: 11 }, (_, i) => i);
    if (variables.length < 2) {
        yValues = [0]; // 如果只有一个变量，则y固定为0
    }

    // 构建一个二维数组
    const data: string[][] = [];
    const leftTop = variables[0] + (variables[1] ? `/${variables[1]}` : '');
    data.push([leftTop, ...yValues.map(v => v.toString())]);

    for (const x of xValues) {
        const row: string[] = [x.toString()];
        for (const y of yValues) {
            try {
                // eslint-disable-next-line no-eval
                const result = (function (x: number, y: number) {
                    return eval(newFormula);
                })(x, y);
                row.push(result.toString());
            } catch (e) {
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

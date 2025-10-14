"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = __importStar(require("vscode"));
let startPos;
let endPos;
let matchRange;
let variables = {};
// Identify Tags
const re_liq_tag = /{%.*?%}/i;
const re_liq_include = /include/i;
// Identify Issues
const re_liq_noclose = /{%((?!%}).)*$/i;
const re_liq_includequotes = /{%\s*include\s+['"][^'"]+['"]/i;
// Identify Syntax
const re_single_string = /'.*'/i;
const re_double_string = /".*"/i;
// Coloring
const stringDecor = vscode.window.createTextEditorDecorationType({
    color: '#CE9178',
});
const liquidDecor = vscode.window.createTextEditorDecorationType({
    color: '#569CD6',
});
const varDecor = vscode.window.createTextEditorDecorationType({
    color: '#99a3a8ff',
});
function activate(context) {
    console.log("Activated LiquidNancy...");
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('liquidLinter');
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(_ => lintDocument(diagnosticCollection)));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(_ => lintDocument(diagnosticCollection)));
}
function lintDocument(collection) {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
        console.log("No editor found for the current document");
        return;
    }
    const diagnostics = [];
    const document = editor.document;
    const stringDecorations = [];
    const liquidDecorations = [];
    const varDecorations = [];
    let ifstart = [];
    let ifend = [];
    for (let linenum = 0; linenum < document.lineCount; linenum++) {
        const line = document.lineAt(linenum).text;
        checkLine(line, linenum);
    }
    /* Core Function */
    function checkLine(line, linenum) {
        let skipcount = 0;
        let liquidstart = -1;
        let liquidend = -1;
        let smolstringstart = -1;
        let smolstringend = -1;
        let hugestringstart = -1;
        let hugestringend = -1;
        let assign = -1;
        let assignvarstart = -1;
        let varname = [];
        for (let x = 0; x < line.length; x++) {
            if (skipcount > 0) {
                skipcount--;
                continue;
            }
            const char = line[x];
            const nextlocation = x + 1;
            const previouslocation = x - 1;
            const nextchar = line[nextlocation];
            const charprior = line[previouslocation];
            /* Line End - Find Issues */
            if (line.length === nextlocation) {
                if (liquidstart !== -1 && liquidend === -1) {
                    startPos = new vscode.Position(linenum, liquidstart);
                    endPos = new vscode.Position(linenum, line.length);
                    matchRange = new vscode.Range(startPos, endPos);
                    console.log("Unclosed Liquid Tag on Line: " + linenum);
                    const diagnostic = new vscode.Diagnostic(matchRange, 'Unclosed Liquid Tag || `%}`', vscode.DiagnosticSeverity.Error);
                    diagnostics.push(diagnostic);
                }
            }
            /* Outside Liquid */
            if (liquidstart === -1) {
                if (char === '%') { // Liquid Tag Start
                    if (charprior === '{') {
                        liquidstart = previouslocation;
                    }
                }
            }
            /* Inside Liquid */
            else {
                if (nextchar === '}') { // Liquid Tag End
                    liquidend = x + 2;
                    startPos = new vscode.Position(linenum, liquidstart);
                    endPos = new vscode.Position(linenum, liquidend);
                    matchRange = new vscode.Range(startPos, endPos);
                    liquidDecorations.push({ range: matchRange });
                    liquidstart = -1;
                    liquidend = -1;
                    continue;
                }
                // Assign
                if (assign !== -1 && assignvarstart !== -1) {
                    if (char === " " || char === "") {
                        startPos = new vscode.Position(linenum, assignvarstart);
                        endPos = new vscode.Position(linenum, x);
                        matchRange = new vscode.Range(startPos, endPos);
                        varDecorations.push({ range: matchRange, hoverMessage: "Liquid Variable" });
                        const variablename = varname.join("");
                        variables[variablename] = "unknown";
                        varname = [];
                        assignvarstart = -1;
                        assign = -1;
                    }
                    else {
                        varname.push(char);
                    }
                }
                else if (assign !== -1 && assignvarstart === -1 && varname.length === 0) {
                    if (char === " " || char === "=") {
                        continue;
                    }
                    else {
                        assignvarstart = x - 1;
                    }
                }
                else if (assign === -1 && char === 'a' && nextchar === 's' && line[nextlocation + 1] === 's' && line[nextlocation + 2] === 'i' && line[nextlocation + 3] === 'g' && line[nextlocation + 4] === 'n') {
                    assign = x;
                    skipcount = 5;
                    continue;
                }
            }
            /* Doesn't Matter Where */
            if (char === '\'') { // ''
                if (smolstringstart === -1) {
                    smolstringstart = x;
                }
                else {
                    smolstringend = nextlocation;
                    startPos = new vscode.Position(linenum, smolstringstart);
                    endPos = new vscode.Position(linenum, smolstringend);
                    matchRange = new vscode.Range(startPos, endPos);
                    stringDecorations.push({ range: matchRange });
                    smolstringstart = -1;
                    hugestringend = -1;
                }
            }
            else if (char === '"') { // ""
                if (hugestringstart === -1) {
                    hugestringstart = x;
                }
                else {
                    hugestringend = nextlocation;
                    startPos = new vscode.Position(linenum, hugestringstart);
                    endPos = new vscode.Position(linenum, hugestringend);
                    matchRange = new vscode.Range(startPos, endPos);
                    stringDecorations.push({ range: matchRange });
                    hugestringstart = -1;
                    hugestringend = -1;
                }
            }
        }
    }
    console.log(variables);
    editor.setDecorations(liquidDecor, liquidDecorations);
    editor.setDecorations(stringDecor, stringDecorations);
    editor.setDecorations(varDecor, varDecorations);
    collection.set(document.uri, diagnostics);
}
//# sourceMappingURL=extension.js.map
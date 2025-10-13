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
// Identify Tags
const re_liq_tag = /{%.*?%}/i;
const re_liq_include = /{%\s*include.*%}/i;
// Identify Issues
const re_liq_noclose = /{%((?!%}).)*$/i;
function activate(context) {
    console.log("Activated LiquidNancy...");
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('liquidLinter');
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(e => lintDocument(e, diagnosticCollection)));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => lintDocument(e.document, diagnosticCollection)));
}
function lintDocument(document, collection) {
    const diagnostics = [];
    for (let linenum = 0; linenum < document.lineCount; linenum++) {
        const line = document.lineAt(linenum).text;
        checkLine(line, linenum);
    }
    function checkLine(line, linenum) {
        /* Liquid */
        let liquidtext;
        if (liquidtext = re_liq_noclose.exec(line)) { // Unclosed Tags
            for (let x = 0; x < liquidtext.length; x++) {
                startPos = new vscode.Position(linenum, liquidtext.index);
                endPos = new vscode.Position(linenum, liquidtext.index + liquidtext[x].length);
                matchRange = new vscode.Range(startPos, endPos);
                const diagnostic = new vscode.Diagnostic(matchRange, 'Unclosed Liquid Tag || Needs `%}`', vscode.DiagnosticSeverity.Error);
                diagnostics.push(diagnostic);
            }
            ;
        }
        else if (liquidtext = re_liq_tag.exec(line)) { // Liquid Tag
            for (let x = 0; x < liquidtext.length; x++) {
                if (re_liq_include.test(liquidtext[x])) { // Include Statement
                    startPos = new vscode.Position(linenum, liquidtext.index);
                    endPos = new vscode.Position(linenum, liquidtext.index + liquidtext[x].length);
                    matchRange = new vscode.Range(startPos, endPos);
                    const diagnostic = new vscode.Diagnostic(matchRange, 'Adds Liquid Web Template or Snippet in at this location\nAs though copy-pasting the text in.', vscode.DiagnosticSeverity.Information);
                    diagnostics.push(diagnostic);
                }
            }
            ;
        }
    }
    collection.set(document.uri, diagnostics);
}
//# sourceMappingURL=extension.js.map
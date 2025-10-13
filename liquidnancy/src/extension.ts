import * as vscode from 'vscode';

let startPos: vscode.Position;
let endPos: vscode.Position;
let matchRange: vscode.Range;

// Identify Tags
const re_liq_tag = /{%.*?%}/i;
const re_liq_include = /{%\s*include.*%}/i;

// Identify Issues
const re_liq_noclose = /{%((?!%}).)*$/i;

export function activate(context: vscode.ExtensionContext) {
    console.log("Activated LiquidNancy...");


    const diagnosticCollection = vscode.languages.createDiagnosticCollection('liquidLinter');
    context.subscriptions.push(diagnosticCollection);

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(e => lintDocument(e, diagnosticCollection))
    );
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => lintDocument(e.document, diagnosticCollection))
    );
}

function lintDocument(document: vscode.TextDocument, collection: vscode.DiagnosticCollection) {
    const diagnostics: vscode.Diagnostic[] = [];

    for (let linenum = 0; linenum < document.lineCount; linenum++) {
        const line = document.lineAt(linenum).text;
        checkLine(line, linenum);
    }

    function checkLine(line: string, linenum: number) {

        /* Liquid */
        let liquidtext: RegExpExecArray | null;

        if (liquidtext = re_liq_noclose.exec(line)) { // Unclosed Tags
            for (let x = 0; x < liquidtext.length; x++) {
                startPos = new vscode.Position(linenum, liquidtext.index);
                endPos = new vscode.Position(linenum, liquidtext.index + liquidtext[x].length);
                matchRange = new vscode.Range(startPos, endPos);
                
                const diagnostic = new vscode.Diagnostic(matchRange, 'Unclosed Liquid Tag || Needs `%}`', vscode.DiagnosticSeverity.Error);
                diagnostics.push(diagnostic);
            };
        }
        else if (liquidtext = re_liq_tag.exec(line)) { // Liquid Tag
            for (let x = 0; x < liquidtext.length; x++) {
                if (re_liq_include.test(liquidtext[x])) { // Include Statement
                    startPos = new vscode.Position(linenum, liquidtext.index);
                    endPos = new vscode.Position(linenum, liquidtext.index + liquidtext[x].length);
                    matchRange = new vscode.Range(startPos, endPos);
                    
                    const diagnostic = new vscode.Diagnostic( matchRange, 'Adds Liquid Web Template or Snippet in at this location\nAs though copy-pasting the text in.', vscode.DiagnosticSeverity.Information );
                    diagnostics.push(diagnostic);
                }
            };
        }
    }

    collection.set(document.uri, diagnostics);
}
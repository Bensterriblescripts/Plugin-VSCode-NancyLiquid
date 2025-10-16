import * as vscode from 'vscode';

let startPos: vscode.Position;
let endPos: vscode.Position;
let matchRange: vscode.Range;

const varDecor = vscode.window.createTextEditorDecorationType({
    color: '#6fadccff',
    fontWeight: 'italic',
});
const stringDecor = vscode.window.createTextEditorDecorationType({
    color: '#CE9178',
});
const objDecor = vscode.window.createTextEditorDecorationType({
    color: '#9cd790ff',
});

const liquidDecor = vscode.window.createTextEditorDecorationType({
    color: '#569CD6',
});
const liquidTagDecor = vscode.window.createTextEditorDecorationType({
    color: '#9ea8afff',
});

const re_include = /\binclude\s+['"]([^'"]+)['"]/i;
const re_block = /\b(block)\s+([a-zA-Z_][\w]*)/i;
const re_endblock = /\bendblock\b/i;
const re_assign = /\b(assign)\s+([a-zA-Z_][\w]*)\s*=\s*(.+)/i;
const re_if = /\b(if)\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(?:==|!=|>|<|>=|<=|contains|and|or)\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*|'[^']*'|"[^"]*")/i;
const re_endif = /\bendif\b/i;

const re_number = /^\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*$/;
const re_string = /^\s*(["'])(?:\\.|(?!\1).)*\1\s*$/;
const re_object = /^\s*(?:this|[A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)+\s*$/;

let variables: {[key: string]: string} = { 
    "user": "Object", "user.id": "String",
    "request": "Object", "request.param": "String",
};
let includes: {[key: string]: string} = {};

export function activate(context: vscode.ExtensionContext) {
    console.log("Activated LiquidNancy...");


    const diagnosticCollection = vscode.languages.createDiagnosticCollection('liquidLinter');
    context.subscriptions.push(diagnosticCollection);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(_ => lintDocument(diagnosticCollection))
    );
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(_ => lintDocument(diagnosticCollection))
    );
}

function lintDocument(collection: vscode.DiagnosticCollection) {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
        console.log("No editor found for the current document");
        return;
    }
    const diagnostics: vscode.Diagnostic[] = [];
    const document = editor.document;

    const varDecorations: vscode.DecorationOptions[] = [];
    const objDecorations: vscode.DecorationOptions[] = [];
    const stringDecorations: vscode.DecorationOptions[] = [];

    const liquidDecorations: vscode.DecorationOptions[] = [];
    const liquidTagDecorations: vscode.DecorationOptions[] = [];

    let tagcount = 0;
    let currenttag: vscode.Range;

    for (let linenum = 0; linenum < document.lineCount; linenum++) {
        const line = document.lineAt(linenum).text;
        checkLine(line, linenum);
    }

    /* Core Function */
    function checkLine(line: string, linenum: number) {
        let skipcount = 0;

        let liquidstart = -1;
        let liquidcontents = [];
        let liquidtag = "";
        let liquidtagstart = -1;

        let smolstringstart = -1;
        let smolstringend = -1;
        let hugestringstart = -1;
        let hugestringend = -1;

        for (let x = 0; x < line.length; x++) {
            if (skipcount > 0) {
                skipcount--;
                continue;
            }

            const char = line[x];
            const nextlocation = x + 1;
            const previouslocation = x - 1;
            const nextchar = line[nextlocation];
            const previouschar = line[previouslocation];

            /* Liquid Tag */
            if (liquidstart === -1) {
                if (char === '%') { // Liquid Tag Starts
                    if (previouschar === '{') {
                        liquidstart = nextlocation;
                        startPos = new vscode.Position(linenum, previouslocation);
                        endPos = new vscode.Position(linenum, nextlocation);
                        matchRange = new vscode.Range(startPos, endPos);
                        liquidDecorations.push({ range: matchRange});

                        liquidtagstart = x;
                        
                    } else {
                        // HTML/JS Stuff goes here
                    }
                }
            }  else {

                /*** Inside a Liquid Tag ***/

                if (char === '%' && nextchar === '}') { // Liquid Tag Ends
                    startPos = new vscode.Position(linenum, x);
                    endPos = new vscode.Position(linenum, nextlocation + 1);
                    matchRange = new vscode.Range(startPos, endPos);
                    liquidDecorations.push({ range: matchRange});

                    liquidtag = liquidcontents.join("");

                    let match: RegExpMatchArray | null;
                    if (match = liquidtag.match(re_include)) { // Include
                        if (match[1]) {
                            startPos = new vscode.Position(linenum, liquidstart);
                            endPos = new vscode.Position(linenum, x);
                            matchRange = new vscode.Range(startPos, endPos);
                            liquidTagDecorations.push({ range: matchRange });

                            includes[match[1]] = "webtemplate";
                        }
                    } else if (match = re_assign.exec(liquidtag)) { // Assign
                        if (match[1] && match[2] && match[3]) {

                            if (re_string.test(match[3])) {
                                variables[match[2]] = "String";
                            } else if (re_object.test(match[3])) {
                                variables[match[2]] = "Object";
                            } else if (re_number.test(match[3])) {
                                variables[match[2]] = "Number";
                            } else {
                                variables[match[2]] = "Any";
                            }

                            console.log("Added variable with the type " + variables[match[2]]);

                            // 'assign'
                            const assStart = liquidstart + match[0].indexOf(match[1]) + 1;
                            startPos = new vscode.Position(linenum, assStart);
                            endPos = new vscode.Position(linenum, assStart + match[1].length);
                            matchRange = new vscode.Range(startPos, endPos);
                            liquidTagDecorations.push({ range: matchRange });

                            // Variable Name
                            const varStart = liquidstart + match[0].indexOf(match[2]) + 1;
                            startPos = new vscode.Position(linenum, varStart);
                            endPos = new vscode.Position(linenum, varStart + match[2].length);
                            matchRange = new vscode.Range(startPos, endPos);
                            varDecorations.push({ range: matchRange, hoverMessage: "Type: " + variables[match[2]] });

                            // Variable
                            const rightStart = liquidstart + match[0].lastIndexOf(match[3]);
                            startPos = new vscode.Position(linenum, rightStart);
                            endPos = new vscode.Position(linenum, rightStart + match[3].length + 1); 
                            matchRange = new vscode.Range(startPos, endPos); 
                            if (variables[match[2]] === 'Object') {
                                objDecorations.push({range: matchRange, hoverMessage: "Type: " + "Object" });
                            } else if (variables[match[2]] === "Any") {
                                objDecorations.push({range: matchRange, hoverMessage: "Type: " + "Any" });
                            }

                        }
                    } else if (match = re_if.exec(liquidtag)) { // If Operation
                        if (match[1] && match[2] && match[3]) {

                            // "if"
                            const ifStart = liquidstart + match[0].indexOf(match[1]) + 1;
                            startPos = new vscode.Position(linenum, ifStart);
                            endPos = new vscode.Position(linenum, ifStart + match[1].length); 
                            matchRange = new vscode.Range(startPos, endPos); 
                            liquidTagDecorations.push({ range: matchRange });

                            // Left Operand
                            const leftStart = liquidstart + match[0].indexOf(match[2]) + 1;
                            startPos = new vscode.Position(linenum, leftStart);
                            const leftStartPos = startPos;
                            endPos = new vscode.Position(linenum, leftStart + match[2].length); 
                            matchRange = new vscode.Range(startPos, endPos); 
                            varDecorations.push({ range: matchRange, hoverMessage: "Type: " + variables[match[2]] });
                            if (!variables[match[2]]) {
                                const diagnostic = new vscode.Diagnostic(matchRange, 'Unable to locate'+match[3]+' in this template', vscode.DiagnosticSeverity.Information);
                                diagnostics.push(diagnostic);
                            }

                            // Right Operand
                            const rightStart = liquidstart + match[0].lastIndexOf(match[3]) + 1;
                            startPos = new vscode.Position(linenum, rightStart);
                            endPos = new vscode.Position(linenum, rightStart + match[3].length); 
                            const rightEndPos = endPos;
                            matchRange = new vscode.Range(startPos, endPos); 
                            varDecorations.push({ range: matchRange, hoverMessage: "Type: " + variables[match[3]] });
                            if (!variables[match[3]]) {
                                const diagnostic = new vscode.Diagnostic(matchRange, 'Unable to locate '+match[3]+' in this template', vscode.DiagnosticSeverity.Information);
                                diagnostics.push(diagnostic);
                            }

                            if (variables[match[2]] && variables[match[3]]) { // Type Operation Error
                                if (variables[match[2]] !== "Any" && variables[match[3]] !== "Any" && variables[match[2]] !== "Object" && variables[match[3]] !== "Object") {
                                    matchRange = new vscode.Range(leftStartPos, rightEndPos);
                                    if (variables[match[2]] !== variables[match[3]]) {
                                        const diagnostic = new vscode.Diagnostic(matchRange, `Invalid type operation, comparing ${match[2]} (${variables[match[2]]}) against ${match[3]} (${variables[match[3]]})` , vscode.DiagnosticSeverity.Error);
                                        diagnostics.push(diagnostic);
                                    }
                                }
                            }

                            if (tagcount === 0) {
                                startPos = new vscode.Position(linenum, liquidstart);
                                endPos = new vscode.Position(linenum, x);
                                matchRange = new vscode.Range(startPos, endPos);
                                currenttag = matchRange;
                            }
                            tagcount++;
                        }
                    } else if (re_endif.test(liquidtag)) {
                        startPos = new vscode.Position(linenum, liquidstart); 
                        endPos = new vscode.Position(linenum, x); 
                        matchRange = new vscode.Range(startPos, endPos); 
                        liquidTagDecorations.push({ range: matchRange });
                        
                        tagcount--;
                    } else if (match = re_block.exec(liquidtag)) { // Block
                        if (match[1] && match[2]) {
                            startPos = new vscode.Position(linenum, liquidstart);
                            endPos = new vscode.Position(linenum, liquidstart + match[1].length + 1);
                            matchRange = new vscode.Range(startPos, endPos);
                            liquidTagDecorations.push({ range: matchRange, hoverMessage: "Block Tag" });
                        }
                    } else if (re_endblock.test(liquidtag)) {
                        startPos = new vscode.Position(linenum, liquidstart);
                        endPos = new vscode.Position(linenum, x);
                        matchRange = new vscode.Range(startPos, endPos);
                        liquidTagDecorations.push({ range: matchRange });
                    }
                    else {
                        startPos = new vscode.Position(linenum, liquidstart);
                        endPos = new vscode.Position(linenum, x);
                        matchRange = new vscode.Range(startPos, endPos);
                        const diagnostic = new vscode.Diagnostic(matchRange, `Unknown Tag` , vscode.DiagnosticSeverity.Error);
                        diagnostics.push(diagnostic);
                    }

                    liquidtag = "";
                    liquidstart = -1;
                } else {
                    liquidcontents.push(char);
                }
            }

            /* Doesn't Matter Where We Are */
            if (char === '\'') { // ''
                if (smolstringstart === -1) {
                    smolstringstart = x;
                } else {
                    smolstringend = nextlocation;
                    startPos = new vscode.Position(linenum, smolstringstart);
                    endPos = new vscode.Position(linenum, smolstringend);
                    matchRange = new vscode.Range(startPos, endPos);
                    stringDecorations.push({ range: matchRange });
                    smolstringstart = -1;
                    hugestringend = -1;
                }
            } else if (char === '"') { // ""
                if (hugestringstart === -1) {
                    hugestringstart = x;
                } else {
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

    if (tagcount !== 0 && currenttag) {
        const diagnostic = new vscode.Diagnostic(currenttag, 'Unclosed `if` Tag', vscode.DiagnosticSeverity.Error);
        diagnostics.push(diagnostic);
    }

    console.log("Variables: ", variables);
    console.log("Templates: ", includes);

    editor.setDecorations(liquidDecor, liquidDecorations);
    editor.setDecorations(liquidTagDecor, liquidTagDecorations);
    editor.setDecorations(stringDecor, stringDecorations);
    editor.setDecorations(varDecor, varDecorations);
    editor.setDecorations(objDecor, objDecorations);

    collection.set(document.uri, diagnostics);
}
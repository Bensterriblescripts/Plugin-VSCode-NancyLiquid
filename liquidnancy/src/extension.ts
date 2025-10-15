import * as vscode from 'vscode';

let startPos: vscode.Position;
let endPos: vscode.Position;
let matchRange: vscode.Range;

let variables: {[key: string]: string} = {};
let webtemplates: {[key: string]: string} = {};

const stringDecor = vscode.window.createTextEditorDecorationType({
    color: '#CE9178',
});
const liquidDecor = vscode.window.createTextEditorDecorationType({
    color: '#569CD6',
});
const liquidTagDecor = vscode.window.createTextEditorDecorationType({
    color: '#7e8e99ff',
});
const varDecor = vscode.window.createTextEditorDecorationType({
    color: '#6fadccff',
    fontWeight: 'bold',
});

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

    const stringDecorations: vscode.DecorationOptions[] = [];
    const liquidDecorations: vscode.DecorationOptions[] = [];
    const liquidTagDecorations: vscode.DecorationOptions[] = [];
    const varDecorations: vscode.DecorationOptions[] = [];

    for (let linenum = 0; linenum < document.lineCount; linenum++) {
        const line = document.lineAt(linenum).text;
        checkLine(line, linenum);
    }


    /* Core Function */
    function checkLine(line: string, linenum: number) {
        let skipcount = 0;

        let liquidstart = -1;

        let smolstringstart = -1;
        let smolstringend = -1;
        let hugestringstart = -1;
        let hugestringend = -1;

        let assign = -1;
        let assignvarstart = -1;
        let assignvartypestart = -1;

        let variablename: string;
        let varname = [];
        let vartype = [];

        let object = -1;

        let include = -1;
        let includetemplatestart = -1;
        let templatename = []; 

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

            /* Line End - Find Issues */
            if (line.length === nextlocation) {
                if (liquidstart !== -1) {
                    startPos = new vscode.Position(linenum, liquidstart);
                    endPos = new vscode.Position(linenum, line.length);
                    matchRange = new vscode.Range(startPos, endPos);
                    console.log("Unclosed Liquid Tag on Line: " + linenum);
                    const diagnostic = new vscode.Diagnostic(matchRange, 'Unclosed Liquid Tag || `%}`', vscode.DiagnosticSeverity.Error);
                    diagnostics.push(diagnostic);
                }
            }

            /* Liquid Tag */
            if (liquidstart === -1) {
                if (char === '%') { // Liquid Tag Starts
                    if (previouschar === '{') {
                        liquidstart = previouslocation;
                        startPos = new vscode.Position(linenum, previouslocation);
                        endPos = new vscode.Position(linenum, nextlocation);
                        matchRange = new vscode.Range(startPos, endPos);
                        liquidDecorations.push({ range: matchRange});
                    }
                         /***                         ***/
                } else { /* We are outside a Liquid Tag */
                         /***                         ***/
                }
            }  else {
                if (char === '%' && nextchar === '}') { // Liquid Tag Ends
                    liquidstart = -1;
                    startPos = new vscode.Position(linenum, x);
                    endPos = new vscode.Position(linenum, nextlocation + 1);
                    matchRange = new vscode.Range(startPos, endPos);
                    liquidDecorations.push({ range: matchRange});

                         /***                        ***/
                } else { /* We are inside a Liquid Tag */
                         /***                        ***/

                    // Assign
                    if (assign !== -1 && assignvarstart !== -1) { // Variable Name
                        if (char === " " || char === "" || char === "=") {
                            startPos = new vscode.Position(linenum, assignvarstart);
                            endPos = new vscode.Position(linenum, x);
                            matchRange = new vscode.Range(startPos, endPos);
                            varDecorations.push({ range: matchRange });

                            varname.push(previouschar);
                            variablename = varname.join("");
                            variables[variablename] = "unknown";

                            assignvarstart = -1;
                            assignvartypestart = x;
                        } else {
                            varname.push(previouschar);
                        }
                    } else if (assign !== -1 && assignvarstart === -1 && assignvartypestart !== -1) { // Variable Value
                        if (nextchar === "%") {
                            const type = checkVariable(vartype.join(""));
                            variables[variablename] = type;
                            varname = [];
                            variablename = "";
                        } else {
                            vartype.push(char);
                        }
                    } else if (assign !== -1 && assignvarstart === -1 && varname.length === 0) { // Variable Name Start
                        if (char === " " || char === "=") {
                            continue;
                        } else {
                            assignvarstart = x - 1;
                        }
                    } else if (assign === -1 && char === 'a' && nextchar === 's' && line[nextlocation + 1] === 's' && line[nextlocation + 2] === 'i' && line[nextlocation + 3] === 'g' && line[nextlocation + 4] === 'n') { // Assign Start
                        startPos = new vscode.Position(linenum, x);
                        endPos = new vscode.Position(linenum, nextlocation + 5);
                        matchRange = new vscode.Range(startPos, endPos);
                        liquidTagDecorations.push({ range: matchRange, hoverMessage: "Declares a new liquid variable" });

                        assign = x;
                        skipcount = 5;
                        continue;
                    }

                    // Include
                    if (include !== -1 && includetemplatestart !== -1) {
                        if (char === "\"" || char === "'") {
                            templatename.push(previouschar);
                            const template = templatename.join("");
                            webtemplates[template] = "unknown";
                            templatename = [];

                            includetemplatestart = -1;
                            include = -1;
                        } else {
                            templatename.push(previouschar);
                        }
                    } else if (include !== -1 && includetemplatestart === -1 && templatename.length === 0) {
                        if (char === " " || char === "=") {
                            continue;
                        } else {
                            includetemplatestart = x;
                        }
                    } else if (include === -1 && char === 'i' && nextchar === 'n' && line[nextlocation + 1] === 'c' && line[nextlocation + 2] === 'l' && line[nextlocation + 3] === 'u' && line[nextlocation + 4] === 'd' && line[nextlocation + 5] === "e") {
                        startPos = new vscode.Position(linenum, x);
                        endPos = new vscode.Position(linenum, nextlocation + 6);
                        matchRange = new vscode.Range(startPos, endPos);
                        liquidTagDecorations.push({ range: matchRange, hoverMessage: "Adds a web template (As though the web template code were copy-pasting it at this location)" });

                        include = x;
                        skipcount = 6;
                        continue;
                    }
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

        function checkVariable(variablename: string) {
            // Run regex over the string to check what it is
            return "string";
        }


    }

    console.log("Variables: ", variables);
    console.log("Web Templates: ", webtemplates)

    editor.setDecorations(liquidDecor, liquidDecorations);
    editor.setDecorations(liquidTagDecor, liquidTagDecorations);
    editor.setDecorations(stringDecor, stringDecorations);
    editor.setDecorations(varDecor, varDecorations);

    collection.set(document.uri, diagnostics);
}
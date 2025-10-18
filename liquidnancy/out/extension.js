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
const varDecor = vscode.window.createTextEditorDecorationType({
    color: '#9bc4d8ff',
    fontWeight: 'italic',
});
const stringDecor = vscode.window.createTextEditorDecorationType({
    color: '#c9856aff',
});
const objDecor = vscode.window.createTextEditorDecorationType({
    color: '#9cd790ff',
});
const liquidDecor = vscode.window.createTextEditorDecorationType({
    color: '#9ea8afff',
});
const liquidTagDecor = vscode.window.createTextEditorDecorationType({
    color: '#9ea8afff',
});
const htmlTagDecor = vscode.window.createTextEditorDecorationType({
    color: '#4da6d3ff',
});
let nestingDecors = {
    0: vscode.window.createTextEditorDecorationType({
        color: '#ac4dacff',
    }),
    1: vscode.window.createTextEditorDecorationType({
        color: '#4dbeb9ff',
    }),
    2: vscode.window.createTextEditorDecorationType({
        color: '#35c576ff',
    }),
    3: vscode.window.createTextEditorDecorationType({
        color: '#4eb871ff',
    }),
    4: vscode.window.createTextEditorDecorationType({
        color: '#9769ebff',
    }),
};
const re_include = /\binclude\s+['"]([^'"]+)['"]/i;
const re_block = /\b(block)\s+([a-zA-Z_][\w]*)/i;
const re_endblock = /\bendblock\b/i;
const re_assign = /\b(assign)\s+([a-zA-Z_][\w]*)\s*=\s*(.+)/i;
const re_if = /\b(?<if>if|elsif)\s+(?<left>.*)\s*(?<operator>==|!=|>|<|>=|<=|contains|and|or)\s*(?<right>.*)\s*/i;
const re_ifbool = /\b(?<if>if|elsif)\s+(?<left>.*)\s*(?<right>.*)\s*/i;
const re_endif = /\bendif\b/i;
const re_number = /^\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*$/i;
const re_string = /^\s*(["'])(?:\\.|(?!\1).)*\1\s*$/i;
const re_object = /^\s*(?:this|[A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)+\s*$/i;
const re_bool = /^\s*true|false|True|False\s*/i;
const re_htmltag = /^\S+/;
let variables = {
    "user": "Object", "user.id": "String",
    "request": "Object", "request.param": "String",
};
let includes = {};
function activate(context) {
    console.log("Activated LiquidNancy...");
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('liquidLinter');
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(_ => lintDocument(diagnosticCollection)));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(_ => lintDocument(diagnosticCollection)));
}
/* Linter */
const diagnostics = [];
const varDecorations = [];
const objDecorations = [];
const stringDecorations = [];
const liquidDecorations = [];
const liquidTagDecorations = [];
const htmlDecorations = [];
const nestedDecorations = {};
let tagcount = 0;
let nestStart;
function lintDocument(collection) {
    const editor = vscode.window.activeTextEditor;
    if (editor === undefined) {
        console.log("No editor found for the current document");
        return;
    }
    diagnostics.length = 0;
    const document = editor.document;
    varDecorations.length = 0;
    objDecorations.length = 0;
    stringDecorations.length = 0;
    liquidDecorations.length = 0;
    liquidTagDecorations.length = 0;
    htmlDecorations.length = 0;
    tagcount = 0;
    nestStart = undefined;
    for (let linenum = 0; linenum < document.lineCount; linenum++) {
        const line = document.lineAt(linenum).text;
        checkLine(line, linenum);
    }
    /* Core Function */
    function checkLine(line, linenum) {
        let match;
        let skipcount = 0;
        let elementstart = -1;
        let outercontent = [];
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
                if (char.includes('{')) {
                    continue;
                } // Performance
                if (char === '%') { // Liquid Tag Starts
                    if (previouschar === '{') {
                        liquidstart = nextlocation;
                        startPos = new vscode.Position(linenum, previouslocation);
                        endPos = new vscode.Position(linenum, nextlocation);
                        matchRange = new vscode.Range(startPos, endPos);
                        liquidDecorations.push({ range: matchRange });
                        liquidtagstart = x;
                        continue;
                    }
                }
                if (elementstart === -1) {
                    if (char === '<') { // Element Starts
                        elementstart = x;
                        if (nextchar === '/') { // Performance
                            skipcount = 1;
                            continue;
                        }
                        continue;
                    }
                }
                else if (elementstart !== -1) {
                    if (char === '>') { // Element Ends
                        elementstart = -1;
                    }
                    else {
                        if (char === '' || char === ' ') {
                            startPos = new vscode.Position(linenum, elementstart);
                            endPos = new vscode.Position(linenum, x);
                            matchRange = new vscode.Range(startPos, endPos);
                            htmlDecorations.push({ range: matchRange });
                            outercontent.length = 0;
                        }
                    }
                    outercontent.push(char);
                }
            }
            else if (liquidstart !== -1) {
                /*** Inside a Liquid Tag ***/
                if (char === '%' && nextchar === '}') { // Liquid Tag Ends
                    skipcount = 1; // Performance
                    startPos = new vscode.Position(linenum, x);
                    endPos = new vscode.Position(linenum, nextlocation + 1);
                    matchRange = new vscode.Range(startPos, endPos);
                    liquidDecorations.push({ range: matchRange });
                    liquidtag = liquidcontents.join("");
                    let match;
                    if (match = liquidtag.match(re_include)) { // Include
                        if (match[1]) {
                            startPos = new vscode.Position(linenum, liquidstart);
                            endPos = new vscode.Position(linenum, x);
                            matchRange = new vscode.Range(startPos, endPos);
                            liquidTagDecorations.push({ range: matchRange });
                            includes[match[1]] = "webtemplate";
                        }
                    }
                    else if (match = re_assign.exec(liquidtag)) { // Assign
                        if (match[1] && match[2] && match[3]) {
                            if (re_bool.test(match[3])) {
                                variables[match[2]] = "Boolean";
                            }
                            else if (re_string.test(match[3])) {
                                variables[match[2]] = "String";
                            }
                            else if (re_object.test(match[3])) {
                                variables[match[2]] = "Object";
                            }
                            else if (re_number.test(match[3])) {
                                variables[match[2]] = "Number";
                            }
                            else {
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
                        }
                    }
                    else if (match = re_if.exec(liquidtag)) { // If (X Operator Y)
                        if (match?.groups) {
                            // "if"
                            const ifStart = liquidstart + match[0].indexOf(match.groups.if) + 1;
                            startPos = new vscode.Position(linenum, ifStart);
                            endPos = new vscode.Position(linenum, ifStart + match.groups.if.length);
                            matchRange = new vscode.Range(startPos, endPos);
                            if (tagcount === 0) {
                                startPos = new vscode.Position(linenum, liquidstart);
                                endPos = new vscode.Position(linenum, x);
                                matchRange = new vscode.Range(startPos, endPos);
                                nestStart = matchRange;
                            }
                            else if (tagcount === 1) {
                                startPos = new vscode.Position(linenum, liquidstart);
                                endPos = new vscode.Position(linenum, x);
                                matchRange = new vscode.Range(startPos, endPos);
                            }
                            else if (tagcount === 2) {
                                startPos = new vscode.Position(linenum, liquidstart);
                                endPos = new vscode.Position(linenum, x);
                                matchRange = new vscode.Range(startPos, endPos);
                            }
                            if (!nestedDecorations[tagcount]) {
                                nestedDecorations[tagcount] = [];
                            }
                            nestedDecorations[tagcount].push({ range: matchRange });
                            // Left Operand
                            const leftStart = liquidstart + match[0].indexOf(match.groups.left);
                            startPos = new vscode.Position(linenum, leftStart);
                            const leftStartPos = startPos;
                            endPos = new vscode.Position(linenum, leftStart + match.groups.left.length);
                            matchRange = new vscode.Range(startPos, endPos);
                            match.groups.left = match.groups.left.trim();
                            let leftType = "";
                            if (variables[match.groups.left]) {
                                varDecorations.push({ range: matchRange, hoverMessage: "Type: " + variables[match.groups.left] });
                                leftType = variables[match.groups.left];
                            }
                            else if (re_bool.test(match.groups.left)) {
                                varDecorations.push({ range: matchRange, hoverMessage: "Type: Boolean" });
                                leftType = "Boolean";
                            }
                            else if (re_string.test(match.groups.left)) {
                                varDecorations.push({ range: matchRange, hoverMessage: "Type: String" });
                                leftType = "String";
                            }
                            else if (re_number.test(match.groups.left)) {
                                varDecorations.push({ range: matchRange, hoverMessage: "Type: Number" });
                                leftType = "Number";
                            }
                            else if (re_object.test(match.groups.left)) {
                                varDecorations.push({ range: matchRange, hoverMessage: "Type: Object" });
                                leftType = "Object";
                            }
                            else {
                                const diagnostic = new vscode.Diagnostic(matchRange, 'Incorrect Left Assignment', vscode.DiagnosticSeverity.Error);
                                diagnostics.push(diagnostic);
                            }
                            // Right Operand
                            const rightStart = liquidstart + match[0].lastIndexOf(match.groups.right) + 1;
                            startPos = new vscode.Position(linenum, rightStart);
                            endPos = new vscode.Position(linenum, rightStart + match.groups.right.length);
                            const rightEndPos = endPos;
                            matchRange = new vscode.Range(startPos, endPos);
                            match.groups.right = match.groups.right.trim();
                            let rightType = "";
                            if (variables[match.groups.right]) {
                                varDecorations.push({ range: matchRange, hoverMessage: "Type: " + variables[match.groups.right] });
                                rightType = variables[match.groups.right];
                            }
                            else if (re_bool.test(match.groups.right)) {
                                varDecorations.push({ range: matchRange, hoverMessage: "Type: Boolean" });
                                rightType = "Boolean";
                            }
                            else if (re_string.test(match.groups.right)) {
                                varDecorations.push({ range: matchRange, hoverMessage: "Type: String" });
                                rightType = "String";
                            }
                            else if (re_number.test(match.groups.right)) {
                                varDecorations.push({ range: matchRange, hoverMessage: "Type: Number" });
                                rightType = "Number";
                            }
                            else if (re_object.test(match.groups.right)) {
                                varDecorations.push({ range: matchRange, hoverMessage: "Type: Object" });
                                rightType = "Object";
                            }
                            else {
                                const diagnostic = new vscode.Diagnostic(matchRange, 'Incorrect Right Assignment', vscode.DiagnosticSeverity.Error);
                                diagnostics.push(diagnostic);
                            }
                            // Type Matching
                            if (leftType !== "Object" && leftType !== "Any" && rightType !== "Object" && rightType !== "Any") {
                                if (leftType !== rightType) {
                                    startPos = new vscode.Position(linenum, liquidstart);
                                    endPos = new vscode.Position(linenum, x);
                                    matchRange = new vscode.Range(startPos, endPos);
                                    const diagnostic = new vscode.Diagnostic(matchRange, `Invalid type operation ${match.groups.left} (${leftType}) and ${match.groups.right} (${rightType})`, vscode.DiagnosticSeverity.Error);
                                    diagnostics.push(diagnostic);
                                }
                            }
                            tagcount++;
                        }
                        // } else if (match = re_ifbool.exec(liquidtag)) { // If Bool
                        //     if (match?.groups) {
                        //         match.groups.bool = match.groups.bool.trim();
                        //         startPos = new vscode.Position(linenum, liquidstart);
                        //         endPos = new vscode.Position(linenum, x);
                        //         matchRange = new vscode.Range(startPos, endPos);
                        //         if (match.groups.bool !== "false" && match.groups.bool !== "False" && match.groups.bool !== "true" && match.groups.bool !== "True" &&
                        //             variables[match.groups.bool] !== "True" && variables[match.groups.bool] !== "true" && variables[match.groups.bool] !== "false" && variables[match.groups.bool] !== "False"
                        //         )  {
                        //             const diagnostic = new vscode.Diagnostic(matchRange, `Invalid Type. Variable is not a Boolean (${match.groups.bool})`, vscode.DiagnosticSeverity.Error);
                        //             diagnostics.push(diagnostic);
                        //         }
                    }
                    else if (re_endif.test(liquidtag)) { // End If
                        startPos = new vscode.Position(linenum, liquidstart);
                        endPos = new vscode.Position(linenum, x);
                        matchRange = new vscode.Range(startPos, endPos);
                        if (tagcount === 1) {
                            startPos = new vscode.Position(linenum, liquidstart);
                            endPos = new vscode.Position(linenum, x);
                            matchRange = new vscode.Range(startPos, endPos);
                        }
                        else if (tagcount === 2) {
                            startPos = new vscode.Position(linenum, liquidstart);
                            endPos = new vscode.Position(linenum, x);
                            matchRange = new vscode.Range(startPos, endPos);
                        }
                        else if (tagcount === 3) {
                            startPos = new vscode.Position(linenum, liquidstart);
                            endPos = new vscode.Position(linenum, x);
                            matchRange = new vscode.Range(startPos, endPos);
                        }
                        tagcount--;
                        if (!nestedDecorations[tagcount]) {
                            nestedDecorations[tagcount] = [];
                        }
                        nestedDecorations[tagcount].push({ range: matchRange });
                    }
                    else if (match = re_block.exec(liquidtag)) { // Block
                        if (match[1] && match[2]) {
                            startPos = new vscode.Position(linenum, liquidstart);
                            endPos = new vscode.Position(linenum, liquidstart + match[1].length + 1);
                            matchRange = new vscode.Range(startPos, endPos);
                            liquidTagDecorations.push({ range: matchRange });
                        }
                    }
                    else if (re_endblock.test(liquidtag)) { // End Block
                        startPos = new vscode.Position(linenum, liquidstart);
                        endPos = new vscode.Position(linenum, x);
                        matchRange = new vscode.Range(startPos, endPos);
                        liquidTagDecorations.push({ range: matchRange });
                    }
                    else {
                        startPos = new vscode.Position(linenum, liquidstart);
                        endPos = new vscode.Position(linenum, x);
                        matchRange = new vscode.Range(startPos, endPos);
                        const diagnostic = new vscode.Diagnostic(matchRange, `Unknown Tag`, vscode.DiagnosticSeverity.Error);
                        diagnostics.push(diagnostic);
                    }
                    liquidtag = "";
                    liquidstart = -1;
                }
                else {
                    liquidcontents.push(char);
                }
            }
            /* Doesn't Matter Where We Are */
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
    if (tagcount !== 0 && nestStart) {
        const diagnostic = new vscode.Diagnostic(nestStart, 'Unclosed `if` Tag', vscode.DiagnosticSeverity.Error);
        diagnostics.push(diagnostic);
    }
    console.log("Variables: ", variables);
    console.log("Templates: ", includes);
    editor.setDecorations(liquidDecor, liquidDecorations);
    editor.setDecorations(liquidTagDecor, liquidTagDecorations);
    editor.setDecorations(stringDecor, stringDecorations);
    editor.setDecorations(varDecor, varDecorations);
    editor.setDecorations(objDecor, objDecorations);
    editor.setDecorations(htmlTagDecor, htmlDecorations);
    for (const key in nestedDecorations) {
        const decorations = nestedDecorations[key];
        editor.setDecorations(nestingDecors[key], decorations);
    }
    collection.set(document.uri, diagnostics);
}
//# sourceMappingURL=extension.js.map
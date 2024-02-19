import { useState, useCallback, useRef, useEffect } from 'react'
import AceEditor from "react-ace";
import './App.css'
import { TypstOutput, TypstWorld } from 'typschterino';
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/theme-nord_dark";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import { useInterval } from 'usehooks-ts';
import MenuDrawer from './MenuDrawer';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';


function OuptutViewer({ output }: { output: TypstOutput }) {
    const svgs = output.svgs();
    if (svgs) {
        return svgs.map((svg, index) => <div
            key={index}
            className='typst-output'
            dangerouslySetInnerHTML={{ __html: svg }}
        />);
    }

    const diagnostics = output.diagnostics();
    if (diagnostics) {
        return <>
            <h3>Typst Error</h3>
            {diagnostics.map((diag, index) => <div
                key={index}
                className='typst-diagnostic'
            >
                {diag}
            </div>)}
        </>;
    }

    return <h2>Enter Typst code in the Editor to the left to get started.</h2>;
}

type Position = {
    row: number,
    column: number,
};

function getIndex(code: string, position: Position): number {
    let r = 0;
    let idx = 0;
    while (r < position.row) {
        const newline = code.indexOf('\n', idx);
        if (newline == -1) {
            return -1;
        }
        r += 1;
        idx = newline + 1;
    }

    return idx + position.column
}

function processEvent(code: string, ev: any, ytext: Y.Text) {
    console.log(ev)

    const startIdx = getIndex(code, ev.start);
    if (startIdx == -1) {
        return;
    }

    const text: string = ev.lines.join('\n');
    if (ev.action == "insert") {
        ytext.insert(startIdx, text);
    } else if (ev.action == "remove") {
        const len = text.length;
        ytext.delete(startIdx, len);
    }
}

function App() {
    const [fileNames, setFileNames] = useState<string[]>([]);
    const [compileOutput, setCompileOutput] = useState<TypstOutput>(TypstOutput.new());
    const [code, setCode] = useState<string>("");
    const [drawerOpen, setDrawerOpen] = useState(false);
    const world = useRef(TypstWorld.new());

    const ytextRef = useRef<Y.Text | null>(null);

    useEffect(() => {
        const doc = new Y.Doc();
        // const yarr = doc.getArray('typsterino-array');
        const ytext = doc.getText('typsterino-text');
        //const wsProvider = new WebsocketProvider('ws://138.201.175.240:1234', 'typsterino-ws', doc)
        const wsProvider = new WebsocketProvider('ws://1.2.3.4:1234', 'typsterino-ws', doc)

        ytextRef.current = ytext;
        ytext.observe((ev, tr) => {
            console.log(ytext.toString());
            setCode(ytext.toString())
        });
    }, []);

    const recompileRef = useRef<null | ((str?: string) => void)>(null);

    const recompile = useCallback((code_arg?: string) => {
        console.log("Recompiling")

        const code_local: string = code_arg ?? code;
        if (!code_local) {
            return;
        }

        try {
            world.current.update_code(code_local);
            setCompileOutput(world.current.compile());
        } catch (e) {
            console.error("Error while compiling typst", e);
        }
    }, [code, world]);
    recompileRef.current = recompile;

    useInterval(recompile, 2000);


    const onDrop = useCallback((acceptedFiles: File[]) => {
        acceptedFiles.forEach((file) => {
            setFileNames((a) => [...a, file.name]);
            const reader = new FileReader();

            reader.onabort = () => console.error('file reading was aborted')
            reader.onerror = () => console.error('file reading has failed')
            reader.onload = () => {
                const binaryStr = reader.result
                if (typeof (binaryStr) === "string") {
                    console.log("got string");
                } else if (!binaryStr) {
                    console.log("got null");
                } else {
                    console.log("got ArrayBuffer");
                    const a = new Uint8Array(binaryStr);
                    world.current.add_file(file.name, a);
                }
            }
            reader.readAsArrayBuffer(file);
        })

    }, [])

    return <div className="App">
        <Allotment vertical={false} minSize={250} separator={true}>
            <div className="editor-viewer">
                <AceEditor
                    mode="java"
                    theme="nord_dark"
                    fontSize={14}
                    showPrintMargin={false}
                    showGutter={true}
                    highlightActiveLine={true}
                    value={code}
                    width="100%"
                    height="100vh"
                    onChange={(code_arg, ev) => {
                        processEvent(code_arg, ev, ytextRef.current!);
                        // setCode(code_arg)
                    }}

                    commands={[{
                        name: 'recompile',
                        bindKey: { win: 'Ctrl-Enter', mac: 'Command-Enter' },
                        exec: () => { (recompileRef.current!)(); }
                    }]}
                />
            </div>

            <div className="output-viewer">
                <div className="output-viewer-scrollable">
                    <OuptutViewer output={compileOutput} />
                    <br />
                    <br />
                    <br />
                    <br />
                    <br />
                </div>
                <MenuDrawer open={drawerOpen} setOpen={setDrawerOpen} fileNames={fileNames} onDrop={onDrop} />
            </div>
        </Allotment>
    </div>;
}
export default App;

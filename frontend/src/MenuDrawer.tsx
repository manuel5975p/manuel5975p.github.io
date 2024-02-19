import { useDropzone } from 'react-dropzone';
import './MenuDrawer.css';

export type MenuDrawerProps = {
    open: boolean,
    fileNames: string[],
    setOpen: (open: boolean) => void,
    onDrop: (acceptedFiles: File[]) => void,
};

const MenuDrawer = ({open, setOpen, fileNames, onDrop}: MenuDrawerProps) => {
    const { getRootProps, getInputProps } = useDropzone({ onDrop })

    return <div className="menu-drawer">
        <div className="menu-drawer-header" onClick={() => setOpen(!open)}>
            <h3>Menu</h3>
            <hr/>
        </div><div className={open ? "menu-drawer-content" : "menu-drawer-content closed"}>
            <div {...getRootProps()} className="drag-target-area">
                <input {...getInputProps()} />
                <p>Drag 'n' drop some files here, or click to select files</p>
            </div>
            <ul>
                {fileNames.map((fileName, index) => <li key={index}>{fileName}</li>)}
            </ul>
        </div>
    </div>;
};

export default MenuDrawer;

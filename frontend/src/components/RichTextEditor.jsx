import { useRef } from "react";
import { Button, ButtonGroup, Dropdown } from "react-bootstrap";
import ReactQuill from "react-quill-new";
import "quill/dist/quill.snow.css";

const toolbarOptions = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ align: [] }],
  ["blockquote", "link"],
  ["clean"],
];

const modules = {
  toolbar: toolbarOptions,
};

const formats = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "list",
  "bullet",
  "align",
  "blockquote",
  "link",
];

export default function RichTextEditor({ value, onChange, placeholder = "Digite o conteúdo...", minHeight = 260, variables = [] }) {
  const editorRef = useRef(null);

  function insertVariable(code) {
    const editor = editorRef.current?.getEditor?.();
    if (!editor) {
      onChange(`${value || ""}${code}`);
      return;
    }
    const selection = editor.getSelection(true);
    const index = selection?.index ?? editor.getLength();
    editor.insertText(index, code, "user");
    editor.setSelection(index + code.length, 0, "user");
  }

  return (
    <div className="rich-text-editor" style={{ "--rich-editor-min-height": `${minHeight}px` }}>
      {variables.length ? (
        <div className="rich-text-editor-actions">
          <Dropdown as={ButtonGroup} align="end">
            <Button variant="outline-secondary" size="sm" disabled>Inserir variável</Button>
            <Dropdown.Toggle split variant="outline-secondary" size="sm" id="rich-editor-variable-dropdown" />
            <Dropdown.Menu className="rich-text-variable-menu">
              {variables.map((variable) => (
                <Dropdown.Item key={variable.code} onClick={() => insertVariable(variable.code)}>
                  <code>{variable.code}</code>
                  {variable.description ? <span className="text-muted ms-2 small">{variable.description}</span> : null}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        </div>
      ) : null}
      <ReactQuill
        ref={editorRef}
        theme="snow"
        value={value || ""}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
      />
    </div>
  );
}

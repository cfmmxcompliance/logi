import React, { useRef, useState } from 'react';
import { Upload, FileArchive, Loader2 } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isProcessing }) => {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.zip')) {
        onFileSelect(file);
      } else {
        alert("Por favor selecciona un archivo ZIP.");
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
      // Critical fix: Reset value to allow selecting the same file again if needed
      e.target.value = ''; 
    }
  };

  const onButtonClick = () => {
    inputRef.current?.click();
  };

  return (
    <div 
      className={`relative w-full max-w-2xl mx-auto h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-all duration-200 ease-in-out ${
        dragActive ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".zip"
        onChange={handleChange}
      />
      
      {isProcessing ? (
        <div className="flex flex-col items-center text-blue-600 animate-pulse">
          <Loader2 className="w-12 h-12 mb-4 animate-spin" />
          <p className="text-lg font-medium">Procesando Data Stage...</p>
          <p className="text-sm text-slate-500">Esto puede tomar unos segundos</p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center p-6">
          <div className="bg-blue-100 p-4 rounded-full mb-4">
            <FileArchive className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">
            Sube tu archivo ZIP del SAT/VUCEM
          </h3>
          <p className="text-slate-500 mb-6 max-w-md">
            Arrastra y suelta tu archivo aquí, o haz clic para seleccionar.
            Asegúrate de que contenga los archivos de texto (501, 551, etc.).
          </p>
          <button
            onClick={onButtonClick}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Seleccionar Archivo
          </button>
        </div>
      )}
      
      {dragActive && (
        <div className="absolute inset-0 w-full h-full bg-blue-500/10 pointer-events-none rounded-xl" />
      )}
    </div>
  );
};

export default FileUpload;
import re

def modify_xml_extractor():
    with open('pages/XMLInvoiceExtractorV01.tsx', 'r') as f:
        content = f.read()

    # Add activeSearch state
    content = re.sub(
        r"const \[searchTerm, setSearchTerm\] = useState\(''\);",
        r"const [searchTerm, setSearchTerm] = useState('');\n    const [activeSearch, setActiveSearch] = useState('');",
        content
    )

    # Replace loadInitialData with activeSearch effect
    load_initial_data_regex = r'useEffect\(\(\) => \{\n\s*const loadInitialData = async \(\) => \{.*?\n\s*loadInitialData\(\);\n\s*\}, \[\]\);'
    
    fetch_logic = """
    useEffect(() => {
        const fetchTargetedData = async () => {
            const terms = activeSearch.split(/[,\\n]/).map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
            if (terms.length === 0) {
                setItems([]);
                return;
            }
            const mainPrefix = terms[0];
            if (mainPrefix.length < 3) return;

            setLoading(true);
            try {
                const refreshedInvoices = await storageService.searchCFDIInvoicesByPrefix(mainPrefix);
                setItems(refreshedInvoices);
            } catch (e) {
                console.error("Failed to fetch CFDI default", e);
            } finally {
                setLoading(false);
            }
        };
        fetchTargetedData();
    }, [activeSearch]);
    """
    content = re.sub(load_initial_data_regex, fetch_logic, content, flags=re.DOTALL)

    # Modify Search Input in UI
    search_input_regex = r'<input[^>]*value=\{searchTerm\}[^>]*onChange=\{\(e\) => setSearchTerm\(e\.target\.value\)\}[^>]*/>'
    
    new_search_input = """<input
                            type="text"
                            placeholder="Buscar (Prefijo para BD, luego Filtro Local)..."
                            className="w-full pl-10 pr-24 py-2 bg-slate-100 border-none rounded-xl text-slate-700 focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setActiveSearch(searchTerm);
                                }
                            }}
                        />
                        <button
                            onClick={() => setActiveSearch(searchTerm)}
                            className="absolute right-1 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                        >
                            Buscar
                        </button>"""
    
    content = re.sub(search_input_regex, new_search_input, content, flags=re.DOTALL)
    
    # Remove the clear button X inside the search input since we now have "Buscar"
    clear_btn_regex = r'\{searchTerm && \(\s*<button\s*onClick=\{\(\) => setSearchTerm\(\'\'\)\}\s*className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"\s*>\s*<X size=\{16\} />\s*</button>\s*\)\}'
    content = re.sub(clear_btn_regex, '', content, flags=re.DOTALL)


    with open('pages/XMLInvoiceExtractorV01.tsx', 'w') as f:
        f.write(content)

def modify_xml_ci():
    with open('pages/XMLCIV01.tsx', 'r') as f:
        content = f.read()

    # Add activeSearch state
    content = re.sub(
        r"const \[searchTerm, setSearchTerm\] = useState\(''\);",
        r"const [searchTerm, setSearchTerm] = useState('');\n    const [activeSearch, setActiveSearch] = useState('');",
        content
    )

    # Replace loadRecords usage
    content = re.sub(
        r'useEffect\(\(\) => \{\n\s*loadRecords\(\);\n\s*checkDiagnostics\(\);\n\s*\}, \[\]\);',
        r"useEffect(() => {\n        checkDiagnostics();\n    }, []);\n\n    useEffect(() => {\n        loadRecords();\n    }, [activeSearch]);",
        content
    )
    
    # Modify loadRecords
    load_records_regex = r'const loadRecords = async \(\) => \{.*?\n\s*\};'
    new_load_records = """const loadRecords = async () => {
        const terms = activeSearch.split(/[,\\n]/).map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
        if (terms.length === 0) {
            setRecords([]);
            return;
        }
        const mainPrefix = terms[0];
        if (mainPrefix.length < 3) return;
        
        setLoading(true);
        try {
            const data = await storageService.searchXMLCIRecordsByPrefix(mainPrefix);
            setRecords(data);
        } catch (error) {
            console.error("Error loading XMLCI records:", error);
            showNotification('Error', 'No se pudieron cargar los registros de XMLCI.', 'error');
        } finally {
            setLoading(false);
        }
    };"""
    content = re.sub(load_records_regex, new_load_records, content, flags=re.DOTALL)

    # Modify Search Input in UI
    search_input_regex = r'<input[^>]*value=\{searchTerm\}[^>]*onChange=\{\(e\) => setSearchTerm\(e\.target\.value\)\}[^>]*/>'
    
    new_search_input = """<input
                            type="text"
                            placeholder="Buscar registros (Prefijo para BD)..."
                            className="w-full pl-10 pr-24 py-2 bg-white border-2 border-slate-100 rounded-xl focus:border-blue-500 transition-colors text-sm outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setActiveSearch(searchTerm);
                                }
                            }}
                        />
                        <button
                            onClick={() => setActiveSearch(searchTerm)}
                            className="absolute right-1 top-1/2 transform -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                        >
                            Buscar
                        </button>"""
    
    content = re.sub(search_input_regex, new_search_input, content, flags=re.DOTALL)
    
    # Remove clear button X
    clear_btn_regex = r'\{searchTerm && \(\s*<button\s*onClick=\{\(\) => setSearchTerm\(\'\'\)\}\s*className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"\s*>\s*<X size=\{16\} />\s*</button>\s*\)\}'
    content = re.sub(clear_btn_regex, '', content, flags=re.DOTALL)


    with open('pages/XMLCIV01.tsx', 'w') as f:
        f.write(content)

modify_xml_extractor()
modify_xml_ci()
print("Done modifying V01 modules")

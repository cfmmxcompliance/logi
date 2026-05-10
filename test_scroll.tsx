export const TestScroll = () => {
  return (
    <div className="h-screen flex flex-col bg-slate-100 p-8">
      <div className="h-20 bg-blue-200 flex-shrink-0">Header Fixed</div>
      <div className="flex-1 overflow-hidden py-6 flex flex-col">
        <div className="bg-white border rounded-xl overflow-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-300">
              <tr><th>Col 1</th><th>Col 2</th></tr>
            </thead>
            <tbody>
              {Array.from({length: 100}).map((_, i) => (
                <tr key={i}><td>Row {i}</td><td>Data</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

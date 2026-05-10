export const TestScroll = () => {
  return (
    <div className="flex flex-col -mt-8 -mx-8 bg-slate-100 overflow-hidden" style={{ height: 'calc(100vh - 4rem)' }}>
      <div className="flex-shrink-0 px-14 pt-8 pb-4 z-20 bg-slate-100 shadow-sm border-b border-slate-200">
         Header
      </div>
      <div className="flex-1 overflow-y-auto px-14 py-6 relative z-10">
         <div className="bg-white h-[2000px]">Content</div>
      </div>
    </div>
  )
}

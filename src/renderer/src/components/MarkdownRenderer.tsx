import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/atom-one-dark.css'

interface Props {
  content: string
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: Props) {
  return (
    <div className="markdown-body max-w-none text-sm text-slate-100">
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')

            return match ? (
              <div className="my-4 overflow-hidden rounded-2xl border border-white/8 bg-slate-950/80 shadow-[0_14px_40px_rgba(2,6,23,0.24)]">
                <div className="flex items-center justify-between border-b border-white/6 bg-white/4 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  <span>{match[1]}</span>
                  <span>core block</span>
                </div>
                <div className="overflow-x-auto p-4">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </div>
              </div>
            ) : (
              <code
                className="rounded-md border border-cyan-300/16 bg-cyan-300/8 px-1.5 py-0.5 text-xs text-cyan-100"
                {...props}
              >
                {children}
              </code>
            )
          },
          a: (props) => (
            <a
              className="text-cyan-200 transition-colors hover:text-cyan-100 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          ul: (props) => <ul className="my-3 list-disc space-y-1 pl-5 marker:text-cyan-300/60" {...props} />,
          ol: (props) => <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-cyan-300/60" {...props} />,
          h1: (props) => <h1 className="mb-3 mt-5 text-lg font-semibold text-white" {...props} />,
          h2: (props) => <h2 className="mb-2 mt-4 text-base font-semibold text-white" {...props} />,
          h3: (props) => <h3 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100" {...props} />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

MarkdownRenderer.displayName = 'MarkdownRenderer'

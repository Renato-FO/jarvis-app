import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/atom-one-dark.css' // Tema Dark do VS Code

interface Props {
  content: string
}

export function MarkdownRenderer({ content }: Props) {
  return (
    <div className="prose prose-invert max-w-none text-sm text-gray-300 leading-relaxed">
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            return !inline && match ? (
              <div className="rounded-lg overflow-hidden my-4 border border-gray-700 bg-[#1e1e1e] shadow-md">
                {/* Header do Código */}
                <div className="bg-[#2d2d2d] px-4 py-1.5 text-xs text-gray-400 border-b border-gray-700 font-mono flex justify-between items-center select-none">
                  <span className="uppercase font-bold tracking-wider">{match[1]}</span>
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/20"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/20"></div>
                  </div>
                </div>
                {/* Área do Código */}
                <div className="p-4 overflow-x-auto">
                  <code className={`${className} font-mono text-sm`} {...props}>
                    {children}
                  </code>
                </div>
              </div>
            ) : (
              <code
                className="bg-gray-800 px-1.5 py-0.5 rounded text-jarvis-accent font-mono text-xs border border-gray-700"
                {...props}
              >
                {children}
              </code>
            )
          },
          // Links
          a: ({ node, ...props }) => (
            <a
              className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          // Listas
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-5 space-y-1 my-2 marker:text-gray-500" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-5 space-y-1 my-2 marker:text-gray-500" {...props} />
          ),
          // Títulos
          h3: ({ node, ...props }) => (
            <h3
              className="text-md font-bold text-white mt-4 mb-2 border-b border-gray-700 pb-1"
              {...props}
            />
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

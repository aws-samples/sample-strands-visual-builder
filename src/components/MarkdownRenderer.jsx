import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MarkdownRenderer = ({ content, isStreaming = false }) => {
  // Custom components for better styling with Cloudscape Design
  const components = {
    // Headers
    h1: ({ children }) => (
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '1rem' }}>
        {children}
      </div>
    ),
    h2: ({ children }) => (
      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem', marginTop: '0.75rem' }}>
        {children}
      </div>
    ),
    h3: ({ children }) => (
      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.25rem', marginTop: '0.5rem' }}>
        {children}
      </div>
    ),
    
    // Paragraphs
    p: ({ children }) => (
      <div style={{ marginBottom: '0.75rem', lineHeight: '1.5' }}>
        {children}
      </div>
    ),
    
    // Lists
    ul: ({ children }) => (
      <ul style={{ marginBottom: '0.75rem', paddingLeft: '1.5rem' }}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol style={{ marginBottom: '0.75rem', paddingLeft: '1.5rem' }}>
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li style={{ marginBottom: '0.25rem' }}>
        {children}
      </li>
    ),
    
    // Code blocks
    code: ({ inline, children, ...props }) => {
      if (inline) {
        return (
          <code
            style={{
              backgroundColor: '#f1f3f3',
              padding: '0.125rem 0.25rem',
              borderRadius: '0.25rem',
              fontFamily: 'Monaco, Consolas, "Courier New", monospace',
              fontSize: '0.875rem'
            }}
            {...props}
          >
            {children}
          </code>
        );
      }
      
      return (
        <pre
          style={{
            backgroundColor: '#f1f3f3',
            padding: '0.75rem',
            borderRadius: '0.375rem',
            overflow: 'auto',
            marginBottom: '0.75rem',
            border: '1px solid #e1e4e8'
          }}
        >
          <code
            style={{
              fontFamily: 'Monaco, Consolas, "Courier New", monospace',
              fontSize: '0.875rem'
            }}
            {...props}
          >
            {children}
          </code>
        </pre>
      );
    },
    
    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote
        style={{
          borderLeft: '4px solid #0073bb',
          paddingLeft: '1rem',
          marginLeft: '0',
          marginBottom: '0.75rem',
          fontStyle: 'italic',
          color: '#5f6b7a'
        }}
      >
        {children}
      </blockquote>
    ),
    
    // Links
    a: ({ children, href, ...props }) => (
      <a
        href={href}
        style={{
          color: '#0073bb',
          textDecoration: 'none'
        }}
        onMouseEnter={(e) => {
          e.target.style.textDecoration = 'underline';
        }}
        onMouseLeave={(e) => {
          e.target.style.textDecoration = 'none';
        }}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    ),
    
    // Strong/Bold
    strong: ({ children }) => (
      <strong style={{ fontWeight: 'bold' }}>
        {children}
      </strong>
    ),
    
    // Emphasis/Italic
    em: ({ children }) => (
      <em style={{ fontStyle: 'italic' }}>
        {children}
      </em>
    ),
    
    // Tables
    table: ({ children }) => (
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          marginBottom: '0.75rem',
          border: '1px solid #e1e4e8'
        }}
      >
        {children}
      </table>
    ),
    th: ({ children }) => (
      <th
        style={{
          border: '1px solid #e1e4e8',
          padding: '0.5rem',
          backgroundColor: '#f8f9fa',
          fontWeight: 'bold',
          textAlign: 'left'
        }}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        style={{
          border: '1px solid #e1e4e8',
          padding: '0.5rem'
        }}
      >
        {children}
      </td>
    ),
    
    // Horizontal rule
    hr: () => (
      <hr
        style={{
          border: 'none',
          borderTop: '1px solid #e1e4e8',
          margin: '1rem 0'
        }}
      />
    )
  };

  return (
    <div style={{ 
      wordBreak: 'break-word',
      overflowWrap: 'break-word',
      maxWidth: '100%'
    }}>
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm]}
        skipHtml={true} // For security, skip HTML tags
      >
        {content || ''}
      </ReactMarkdown>
      {isStreaming && (
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '16px',
            backgroundColor: '#0073bb',
            marginLeft: '2px',
            animation: 'blink 1s infinite'
          }}
        />
      )}
      <style>
        {`
          @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
        `}
      </style>
    </div>
  );
};

export default MarkdownRenderer;
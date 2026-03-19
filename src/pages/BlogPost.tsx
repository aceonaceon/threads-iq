import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPostBySlug, estimateReadTime } from '../lib/blog';

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPostBySlug(slug) : undefined;
  
  const readTime = useMemo(() => {
    if (!post) return 0;
    return estimateReadTime(post.content);
  }, [post]);

  // Set SEO title and meta
  useMemo(() => {
    if (post) {
      document.title = `${post.title} | ThreadsIQ`;
      
      // Update or create meta description
      let metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', post.description);
      } else {
        const meta = document.createElement('meta');
        meta.name = 'description';
        meta.content = post.description;
        document.head.appendChild(meta);
      }
    }
  }, [post]);

  if (!post) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] pt-20 pb-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">文章不存在</h1>
          <Link to="/blog" className="text-[#E85D04] hover:underline">
            返回部落格
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-20 pb-16">
      <div className="max-w-3xl mx-auto px-4">
        {/* Back Link */}
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-[#E85D04] transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回部落格
        </Link>

        {/* Article Header */}
        <header className="mb-8">
          {/* Category */}
          <span className="inline-block px-3 py-1 text-xs font-medium bg-[#E85D04]/10 text-[#E85D04] rounded-full mb-4">
            {post.category}
          </span>
          
          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            {post.title}
          </h1>
          
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span>{post.date}</span>
            <span>•</span>
            <span>{post.author}</span>
            <span>•</span>
            <span>約 {readTime} 分鐘閱讀</span>
          </div>
        </header>

        {/* Article Content */}
        <article className="prose prose-invert prose-lg max-w-none
          prose-headings:text-white prose-headings:font-bold
          prose-p:text-gray-300 prose-p:leading-relaxed
          prose-a:text-[#E85D04] prose-a:no-underline hover:prose-a:underline
          prose-strong:text-white
          prose-ul:text-gray-300 prose-ol:text-gray-300
          prose-li:marker:text-[#E85D04]
          prose-blockquote:border-l-[#E85D04] prose-blockquote:text-gray-400
          prose-code:text-[#E85D04] prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
          prose-pre:bg-gray-800 prose-pre:text-gray-300
          prose-hr:border-gray-700
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content}
          </ReactMarkdown>
        </article>

        {/* CTA Block */}
        <div className="mt-12 p-6 bg-gradient-to-r from-[#E85D04]/10 to-[#E85D04]/5 border border-[#E85D04]/20 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-2">
            想知道你的帳號語意身份是什麼嗎？
          </h3>
          <p className="text-gray-400 mb-4">
            用 ThreadsIQ 免費分析你的帳號，找出你的優勢與改進空間！
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E85D04] hover:bg-[#E85D04]/90 text-white font-medium rounded-lg transition-colors"
          >
            免費分析帳號
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

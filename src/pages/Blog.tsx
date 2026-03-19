import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getAllPosts, getCategories, BlogPost } from '../lib/blog';

export default function Blog() {
  const [selectedCategory, setSelectedCategory] = useState('全部');
  
  const posts = useMemo(() => getAllPosts(), []);
  const categories = useMemo(() => getCategories(), []);
  
  const filteredPosts = useMemo(() => {
    if (selectedCategory === '全部') {
      return posts;
    }
    return posts.filter(post => post.category === selectedCategory);
  }, [posts, selectedCategory]);

  // Set SEO title
  useMemo(() => {
    document.title = '部落格 | ThreadsIQ';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', '深入了解 Threads 語意演算法、Creator Embedding、與內容優化技巧。');
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = '深入了解 Threads 語意演算法、Creator Embedding、與內容優化技巧。';
      document.head.appendChild(meta);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-3">部落格</h1>
          <p className="text-gray-400">深入了解 Threads 語意演算法與內容優化技巧</p>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 justify-center">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-[#E85D04] text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Posts Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {filteredPosts.map((post: BlogPost) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="block bg-gray-900/50 border border-white/5 rounded-xl p-5 hover:border-[#E85D04]/50 transition-colors group"
            >
              {/* Category Tag */}
              <span className="inline-block px-2.5 py-1 text-xs font-medium bg-[#E85D04]/10 text-[#E85D04] rounded-full mb-3">
                {post.category}
              </span>
              
              {/* Title */}
              <h2 className="text-lg font-semibold text-white mb-2 group-hover:text-[#E85D04] transition-colors">
                {post.title}
              </h2>
              
              {/* Description */}
              <p className="text-sm text-gray-400 mb-4 line-clamp-2">
                {post.description}
              </p>
              
              {/* Meta */}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{post.date}</span>
                <span>{post.author}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Empty State */}
        {filteredPosts.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">目前沒有文章</p>
          </div>
        )}
      </div>
    </div>
  );
}

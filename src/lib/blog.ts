// Blog post loader and parser
// Uses Vite's import.meta.glob to load markdown files at build time

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  date: string;
  author: string;
  keywords: string[];
  content: string;
}

interface FrontmatterResult {
  frontmatter: {
    title: string;
    slug: string;
    description: string;
    category: string;
    priority: string;
    date: string;
    author: string;
    keywords: string[];
  };
  content: string;
}

function parseFrontmatter(raw: string): FrontmatterResult {
  // Split on first two --- markers
  const parts = raw.split(/^---$/m);
  
  if (parts.length < 3) {
    throw new Error('Invalid frontmatter format');
  }
  
  // Parse frontmatter lines
  const frontmatterLines = parts[1].trim().split('\n');
  const frontmatter: Record<string, string | string[]> = {};
  
  for (const line of frontmatterLines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      
      // Handle quoted strings
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      
      // Handle arrays like: keyword1, keyword2, keyword3
      if (key === 'keywords') {
        frontmatter[key] = value.split(',').map(k => k.trim().replace(/^"|"$/g, ''));
      } else {
        frontmatter[key] = value;
      }
    }
  }
  
  // Content is everything after the second ---
  const content = parts.slice(2).join('---').trim();
  
  return {
    frontmatter: {
      title: frontmatter.title as string,
      slug: frontmatter.slug as string,
      description: frontmatter.description as string,
      category: frontmatter.category as string,
      priority: frontmatter.priority as string,
      date: frontmatter.date as string,
      author: frontmatter.author as string,
      keywords: frontmatter.keywords as string[],
    },
    content,
  };
}

// Load all blog posts using Vite's import.meta.glob
function loadPosts(): BlogPost[] {
  // This uses Vite's glob import with ?raw query to get raw content
  const modules = import.meta.glob('/content/blog/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  
  const posts: BlogPost[] = [];
  
  for (const [filepath, rawContent] of Object.entries(modules)) {
    try {
      const { frontmatter, content } = parseFrontmatter(rawContent);
      
      posts.push({
        slug: frontmatter.slug,
        title: frontmatter.title,
        description: frontmatter.description,
        category: frontmatter.category,
        priority: frontmatter.priority,
        date: frontmatter.date,
        author: frontmatter.author,
        keywords: frontmatter.keywords,
        content,
      });
    } catch (e) {
      console.error(`Error parsing blog post ${filepath}:`, e);
    }
  }
  
  // Sort by date descending
  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  return posts;
}

// Get all blog posts
export function getAllPosts(): BlogPost[] {
  return loadPosts();
}

// Get a single post by slug
export function getPostBySlug(slug: string): BlogPost | undefined {
  const posts = loadPosts();
  return posts.find(post => post.slug === slug);
}

// Get unique categories
export function getCategories(): string[] {
  const posts = loadPosts();
  const categories = new Set(posts.map(post => post.category));
  return ['全部', ...Array.from(categories)];
}

// Calculate estimated read time
export function estimateReadTime(content: string): number {
  const wordsPerMinute = 200; // Chinese typically reads slower
  // Remove markdown syntax to count actual words
  const text = content
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
  
  const words = text.length / 2; // Rough estimate for Chinese
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

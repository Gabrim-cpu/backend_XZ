import { pool } from '../config/database.js';
import { getDB } from '../config/mongodb.js';
import { handleAction } from '../services/pointService.js';
import { createNotification } from '../services/notificationService.js';

// ============ POSTS ============
export const getPosts = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT p.*, u.display_name, u.avatar_url, u.identity
       FROM posts p
       JOIN users u ON p.author_id = u.id
       WHERE p.type = 'post'
       ORDER BY p.created_at DESC
       LIMIT 50`
    );
    res.json({ success: true, posts: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createPost = async (req, res) => {
  const userId = req.user.id;
  const { body, media_url } = req.body;

  if (!body) {
    return res.status(400).json({ error: 'Post body is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO posts (author_id, author_name, type, body, media_url)
       VALUES ($1, $2, 'post', $3, $4)
       RETURNING *`,
      [userId, req.user.display_name, body, media_url || null]
    );

    // Award points for posting
    await handleAction(userId, 'PUBLISH_STORY');

    res.status(201).json({ success: true, post: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ STORIES (Wisdom Archive) ============
export const getStories = async (req, res) => {
  const { filter } = req.query; // filter by category: resilience, philosophy, career, etc.
  try {
    let query = `
      SELECT p.*, u.display_name, u.avatar_url, u.identity
      FROM posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.type = 'audio_archive' OR p.type = 'story'
    `;
    const params = [];

    // Optional category filter
    if (filter) {
      query += ` AND p.body LIKE $1`;
      params.push(`%${filter}%`);
    }

    query += ` ORDER BY p.created_at DESC LIMIT 50`;

    const result = await pool.query(query, params);
    res.json({ success: true, stories: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createStory = async (req, res) => {
  const userId = req.user.id;
  const { body, media_url, category } = req.body;

  if (!body) {
    return res.status(400).json({ error: 'Story body is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO posts (author_id, author_name, type, body, media_url)
       VALUES ($1, $2, 'audio_archive', $3, $4)
       RETURNING *`,
      [userId, req.user.display_name, body, media_url || null]
    );

    // Award points for story
    await handleAction(userId, 'PUBLISH_STORY');

    res.status(201).json({ success: true, story: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ LIBRARY (Knowledge Articles) ============
export const getLibrary = async (req, res) => {
  const db = getDB();
  if (!db) {
    return res.status(500).json({ error: 'MongoDB connection is not active' });
  }

  try {
    const articles = await db.collection('knowledge_articles')
      .find({ published: true })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray();

    res.json({ success: true, articles: articles.map(a => ({
      id: a._id,
      title: a.title,
      excerpt: a.excerpt,
      content: a.content,
      author: a.author,
      category: a.category,
      tags: a.tags || [],
      created_at: a.created_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createLibraryArticle = async (req, res) => {
  const userId = req.user.id;
  const { title, excerpt, content, category, tags } = req.body;
  const db = getDB();

  if (!db) {
    return res.status(500).json({ error: 'MongoDB connection is not active' });
  }

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  try {
    const article = {
      title,
      excerpt: excerpt || content.substring(0, 150),
      content,
      category: category || 'General',
      tags: tags || [],
      author: req.user.display_name,
      author_id: userId,
      published: false, // Requires moderation
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = await db.collection('knowledge_articles').insertOne(article);

    // Award points for contributing to library
    await handleAction(userId, 'PUBLISH_STORY');

    res.status(201).json({ success: true, article: { id: result.insertedId, ...article } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const publishLibraryArticle = async (req, res) => {
  const { articleId } = req.params;
  const db = getDB();

  if (!db) {
    return res.status(500).json({ error: 'MongoDB connection is not active' });
  }

  try {
    // Get article details before publishing
    const article = await db.collection('knowledge_articles').findOne({ _id: articleId });
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Only admins can publish (future: check req.user.role === 'admin')
    const result = await db.collection('knowledge_articles').updateOne(
      { _id: articleId },
      { $set: { published: true, updated_at: new Date() } }
    );

    // Get author's user ID from database
    const authorResult = await pool.query(
      'SELECT id FROM users WHERE display_name = $1 LIMIT 1',
      [article.author]
    );
    if (authorResult.rows[0]) {
      // Notify author that their article was published
      createNotification({
        recipientUserId: authorResult.rows[0].id,
        type: 'article_published',
        title: '✨ Article Published',
        body: `"${article.title}" is now live in the knowledge library!`,
        important: true,
      });
    }

    res.json({ success: true, message: 'Article published' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ MODERATION ============
export const getPendingArticles = async (req, res) => {
  const db = getDB();
  if (!db) {
    return res.status(500).json({ error: 'MongoDB connection is not active' });
  }

  try {
    const articles = await db.collection('knowledge_articles')
      .find({ published: false })
      .sort({ created_at: -1 })
      .toArray();

    res.json({ success: true, articles: articles.map(a => ({
      id: a._id,
      title: a.title,
      excerpt: a.excerpt,
      author: a.author,
      category: a.category,
      created_at: a.created_at,
    })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const rejectArticle = async (req, res) => {
  const { articleId } = req.params;
  const db = getDB();

  if (!db) {
    return res.status(500).json({ error: 'MongoDB connection is not active' });
  }

  try {
    const result = await db.collection('knowledge_articles').deleteOne({
      _id: articleId
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json({ success: true, message: 'Article rejected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============ COMMENTS/REFLECTIONS ============
export const addComment = async (req, res) => {
  const userId = req.user.id;
  const { contentType, contentId, text } = req.body;
  const db = getDB();

  if (!db) {
    return res.status(500).json({ error: 'MongoDB connection is not active' });
  }

  if (!text || !contentType || !contentId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const comment = {
      author: req.user.display_name,
      author_id: userId,
      avatar_url: req.user.avatar_url || null,
      text,
      created_at: new Date(),
      likes: 0,
    };

    const result = await db.collection('comments').insertOne({
      content_type: contentType, // 'story' | 'article'
      content_id: contentId,
      ...comment,
    });

    // Get content author and notify them
    if (contentType === 'story') {
      const story = await pool.query(
        'SELECT author_id FROM posts WHERE id = $1 AND type IN (\'story\', \'audio_archive\')',
        [contentId]
      );
      if (story.rows[0] && story.rows[0].author_id !== userId) {
        createNotification({
          recipientUserId: story.rows[0].author_id,
          type: 'new_reflection',
          title: '💬 New Reflection',
          body: `${req.user.display_name} reflected on your story.`,
          important: true,
        });
      }
    } else if (contentType === 'article') {
      const article = await db.collection('knowledge_articles').findOne({ _id: contentId });
      if (article) {
        const authorResult = await pool.query(
          'SELECT id FROM users WHERE display_name = $1 LIMIT 1',
          [article.author]
        );
        if (authorResult.rows[0] && authorResult.rows[0].id !== userId) {
          createNotification({
            recipientUserId: authorResult.rows[0].id,
            type: 'new_reflection',
            title: '💬 New Comment',
            body: `${req.user.display_name} commented on your article.`,
            important: true,
          });
        }
      }
    }

    res.status(201).json({ success: true, comment: { id: result.insertedId, ...comment } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getComments = async (req, res) => {
  const { contentType, contentId } = req.query;
  const db = getDB();

  if (!db) {
    return res.status(500).json({ error: 'MongoDB connection is not active' });
  }

  if (!contentType || !contentId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const comments = await db.collection('comments')
      .find({
        content_type: contentType,
        content_id: contentId,
      })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray();

    res.json({ success: true, comments: comments.map(c => ({
      id: c._id,
      author: c.author,
      avatar_url: c.avatar_url,
      text: c.text,
      created_at: c.created_at,
      likes: c.likes || 0,
    })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// postslice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../services/api";

// Constants & Config
const USE_MOCK_DATA = false;
const STORAGE_KEY = "agrikonnect_offline_posts";
const COMMENTS_STORAGE_KEY = "agrikonnect_local_comments";

// Helper Functions

// Get local comments from localStorage (organized by postId)
const getLocalComments = () => {
  try {
    const data = localStorage.getItem(COMMENTS_STORAGE_KEY);
    if (!data) return {};
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to load local comments:", err);
    return {};
  }
};

// Save local comments to localStorage
const saveLocalComments = (commentsMap) => {
  try {
    localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(commentsMap));
  } catch (err) {
    console.error("Failed to save local comments:", err);
  }
};

// Get posts from local storage
const getOfflinePosts = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    // Ensure we mark them as offline-only
    return parsed.map((p) => ({ ...p, isLocal: true }));
  } catch (err) {
    console.error("Failed to load offline posts:", err);
    return [];
  }
};

// Save posts to local storage
const saveOfflinePosts = (posts) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch (err) {
    console.error("Failed to save offline posts:", err);
  }
};

// Helper to format the author object consistently
const formatAuthor = (rawPost, currentUser) => {
  // If anonymous, return early
  if (rawPost.isAnonymous || rawPost.is_anonymous) {
    return { id: rawPost.author_id || rawPost.authorId, name: "Anonymous" };
  }

  let authorData = rawPost.author || rawPost.user || {};

  // Handle if author is just a string ID
  if (typeof authorData === "string") {
    authorData = { name: authorData };
  }

  // Determine name
  let name = authorData.name || authorData.username;
  
  if (!name) {
    const first = authorData.first_name || authorData.firstName || "";
    const last = authorData.last_name || authorData.lastName || "";
    name = `${first} ${last}`.trim();
  }

  // Fallback: check if the current user owns this post
  const authorId = rawPost.author_id || rawPost.authorId || rawPost.user_id;
  if (!name && currentUser && String(authorId) === String(currentUser.id)) {
    name = currentUser.name || "You";
  }

  return { ...authorData, id: authorId, name: name || "Unknown User" };
};

// Main function to clean up post data from the API
const standardizePost = (rawPost, currentUser) => {
  if (!rawPost) return null;

  const isLocal = !!(
    rawPost.isLocal ||
    rawPost.clientId ||
    String(rawPost.id).startsWith("local-")
  );

  const author = formatAuthor(rawPost, currentUser);

  // Handle image URL - normalize various field names and convert relative URLs to absolute
  let imageUrl = rawPost.imageUrl || rawPost.image_url || rawPost.image || rawPost.imageFile;
  if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
    // Convert relative URL to absolute URL using the API base
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    const apiBase = baseURL.replace('/api/v1', ''); // Remove /api/v1 to get server base
    imageUrl = imageUrl.startsWith('/') ? `${apiBase}${imageUrl}` : `${apiBase}/${imageUrl}`;
  }

  // Normalize comments array - ensure it includes author info
  const comments = (rawPost.comments || []).map(comment => ({
    id: comment.id,
    content: comment.content || comment.text,
    author: formatAuthor(comment, currentUser),
    created_at: comment.created_at || comment.createdAt,
    isLocal: comment.isLocal || false
  }));

  return {
    ...rawPost,
    author,
    isLocal,
    isRemote: !isLocal,
    isAnonymous: !!(rawPost.isAnonymous || rawPost.is_anonymous),
    createdAt: rawPost.createdAt || rawPost.created_at,
    updatedAt: rawPost.updatedAt || rawPost.updated_at,
    // Handle different API field names for image
    imageUrl,
    // Preserve and normalize comments
    comments,
    // Handle different API field names for likes
    likeCount: rawPost.likeCount || rawPost.likes_count || rawPost.likes?.length || 0,
    isLiked: !!(rawPost.isLiked || rawPost.is_liked || rawPost.user_liked),
    // Handle different API field names for comments
    commentCount: rawPost.commentCount || rawPost.comments_count || rawPost.comments?.length || 0,
  };
};

// Helper to extract array of posts from various API response shapes
const getPostsArray = (response) => {
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.posts)) return data.posts;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.results)) return data.results;
  return [];
};

const initialState = {
  items: [],
  isLoading: false,
  errorMsg: null,
  page: 1,
  maxPages: 1,
  hasMoreItems: false,
};

export const fetchPosts = createAsyncThunk(
  "posts/loadPosts",
  async (pageNum = 1, { rejectWithValue, getState }) => {
    const user = getState().auth?.user;

    if (USE_MOCK_DATA) {
      return {
        posts: MOCK_DATA.map((p) => standardizePost(p, user)),
        page: 1,
        totalPages: 1,
      };
    }

    try {
      const response = await api.get(`/posts?page=${pageNum}`);
      const data = response.data;
      const rawPosts = Array.isArray(data) ? data : (data.posts || data.data || data.results || []);
      
      // Standardize posts
      let finalPosts = rawPosts.map((p) => standardizePost(p, user));
      
      // Merge local comments with fetched posts
      const localComments = getLocalComments();
      console.log('Loading local comments from localStorage:', localComments);
      finalPosts = finalPosts.map(post => {
        const postLocalComments = localComments[post.id];
        if (postLocalComments && postLocalComments.length > 0) {
          // Merge local comments with server comments, avoiding duplicates
          const existingCommentIds = new Set((post.comments || []).map(c => c.id));
          const uniqueLocalComments = postLocalComments.filter(c => !existingCommentIds.has(c.id));
          console.log(`Merging ${uniqueLocalComments.length} local comments with post ${post.id}`);
          
          return {
            ...post,
            comments: [...(post.comments || []), ...uniqueLocalComments],
            commentCount: (post.comments || []).length + uniqueLocalComments.length
          };
        }
        return post;
      });
      
      const totalPages = (typeof data === 'object' && !Array.isArray(data)) ? (data.totalPages || data.pages || 1) : 1;

      return {
        posts: finalPosts,
        page: pageNum,
        totalPages,
      };
    } catch (err) {
      // Fallback to offline mode if server error or connection refused
      const isConnectionError = err.code === 'ERR_NETWORK' || 
                                err.code === 'ERR_CONNECTION_REFUSED' || 
                                err.message === 'Network Error' ||
                                err.response?.status >= 500;
      
      if (isConnectionError) {
        // Suppress error logging for connection issues (server down)
        if (pageNum === 1 && !err.response?.status) {
          console.warn('Posts service offline - loading cached posts');
        }
        
        let offlinePosts = getOfflinePosts().map((p) => standardizePost(p, user));
        
        // Merge local comments with offline posts too
        const localComments = getLocalComments();
        offlinePosts = offlinePosts.map(post => {
          const postLocalComments = localComments[post.id];
          if (postLocalComments && postLocalComments.length > 0) {
            return {
              ...post,
              comments: [...(post.comments || []), ...postLocalComments],
              commentCount: (post.comments || []).length + postLocalComments.length
            };
          }
          return post;
        });
        
        return {
          posts: offlinePosts,
          page: 1,
          totalPages: 1,
        };
      }
      
      return rejectWithValue(err.response?.data?.message || "Could not load posts");
    }
  }
);

export const createPost = createAsyncThunk(
  "posts/createNew",
  async ({ title, content, imageFile, isAnonymous }, { rejectWithValue, getState }) => {
    const user = getState().auth?.user;

    try {
      let response;
      
      if (imageFile) {
        const payload = new FormData();
        payload.append("title", title);
        payload.append("content", content);
        payload.append("is_anonymous", isAnonymous ? "true" : "false");
        payload.append("image", imageFile);
        
        // Log FormData contents for debugging
        console.log("FormData contents:");
        console.log("- title:", title);
        console.log("- content:", content);
        console.log("- is_anonymous:", isAnonymous ? "true" : "false");
        console.log("- image file:", imageFile.name, "type:", imageFile.type, "size:", imageFile.size);
        
        response = await api.post("/posts", payload);
      } else {
        response = await api.post("/posts", {
          title,
          content,
          is_anonymous: Boolean(isAnonymous)
        });
      }
      
      const newPost = response.data?.post || response.data;
      return standardizePost(newPost, user);

    } catch (err) {
      // Log detailed error information for debugging
      console.error("Create post error details:");
      console.error("Status:", err.response?.status);
      console.error("Status Text:", err.response?.statusText);
      console.error("Error Data:", err.response?.data);
      console.error("Error Message:", err.message);
      console.error("Request payload - title:", title, "content length:", content?.length, "has image:", !!imageFile);

      // If image upload failed (500 error), try again without the image
      if (err.response?.status === 500 && imageFile) {
        console.warn("Image upload failed, retrying without image...");
        try {
          const retryResponse = await api.post("/posts", {
            title,
            content,
            is_anonymous: Boolean(isAnonymous)
          });
          const newPost = retryResponse.data?.post || retryResponse.data;
          return standardizePost(newPost, user);
        } catch (retryErr) {
          console.error("Retry without image also failed:", retryErr.response?.data);
        }
      }

      // Create a local post if network fails
      if (err.response?.status === 405 || err.message === "Network Error") {
        const tempPost = {
          id: `local-${Date.now()}`,
          clientId: `local-${Date.now()}`,
          title,
          content,
          imageUrl: imageFile ? URL.createObjectURL(imageFile) : null,
          isAnonymous,
          isLocal: true,
          author: { name: isAnonymous ? "Anonymous" : "You" },
          createdAt: new Date().toISOString(),
          likeCount: 0,
          isLiked: false,
          comments: [],
        };

        // Save to local storage
        const currentLocal = getOfflinePosts();
        saveOfflinePosts([tempPost, ...currentLocal]);

        return standardizePost(tempPost, user);
      }

      // Extract error message from different possible response structures
      let errorMessage = "Failed to create post";
      
      if (err.response?.data) {
        if (typeof err.response.data === 'string') {
          errorMessage = err.response.data;
        } else if (err.response.data.message) {
          errorMessage = err.response.data.message;
        } else if (err.response.data.error) {
          errorMessage = err.response.data.error;
        } else if (err.response.data.errors) {
          // Handle validation errors array
          errorMessage = Array.isArray(err.response.data.errors) 
            ? err.response.data.errors.join(", ")
            : JSON.stringify(err.response.data.errors);
        }
      }
      
      if (err.response?.statusText) {
        errorMessage = `${err.response.statusText}: ${errorMessage}`;
      }
      
      return rejectWithValue(errorMessage);
    }
  }
);

export const toggleLikePost = createAsyncThunk(
  "posts/toggleLike",
  async ({ postId, currentlyLiked }, { rejectWithValue }) => {
    try {
      // If liked, we unlike (delete), else we like (post)
      const path = `/posts/${postId}/like`;
      const response = currentlyLiked 
        ? await api.delete(path) 
        : await api.post(path);
        
      return { postId, data: response.data };
    } catch (err) {
      console.error("Like toggle error:", {
        status: err.response?.status,
        message: err.message,
        postId
      });
      
      // Handle offline mode - allow optimistic update
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error' || err.code === 'ERR_CONNECTION_REFUSED') {
        return { postId, data: { success: true }, offline: true };
      }
      
      return rejectWithValue(err.response?.data?.message || "Failed to update like");
    }
  }
);

export const submitComment = createAsyncThunk(
  "posts/addComment",
  async ({ postId, text }, { rejectWithValue, getState }) => {
    const user = getState().auth?.user;
    
    // Validate input
    if (!text || !text.trim()) {
      return rejectWithValue("Comment cannot be empty");
    }
    
    if (!postId) {
      return rejectWithValue("Invalid post ID");
    }
    
    try {
      const response = await api.post(`/posts/${postId}/comments`, { content: text.trim() });
      
      // Extract comment from response - handle different response structures
      const commentData = response.data?.comment || response.data?.data || response.data;
      
      console.log("Comment created successfully:", commentData);
      
      return { postId, comment: commentData };
    } catch (err) {
      console.error("Comment error:", {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: err.message,
        postId,
        requestData: { content: text }
      });
      
      // Handle offline mode - create local comment
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error' || err.code === 'ERR_CONNECTION_REFUSED') {
        const localComment = {
          id: `local-comment-${Date.now()}`,
          content: text,
          author: {
            id: user?.id,
            name: user?.name || user?.first_name || 'You'
          },
          created_at: new Date().toISOString(),
          isLocal: true
        };
        console.log('Creating local comment (offline):', localComment);
        return { postId, comment: localComment, offline: true };
      }
      
      // Return detailed error message
      const errorMsg = err.response?.data?.message || 
                       err.response?.data?.error || 
                       err.response?.statusText ||
                       (err.response?.status === 500 ? "Server error - please check backend logs" : "Comment failed");
      
      return rejectWithValue(errorMsg);
    }
  }
);

export const deleteComment = createAsyncThunk(
  "posts/deleteComment",
  async ({ postId, commentId }, { rejectWithValue }) => {
    try {
      await api.delete(`/posts/${postId}/comments/${commentId}`);
      return { postId, commentId };
    } catch (err) {
      return rejectWithValue("Failed to delete comment");
    }
  }
);

export const removePost = createAsyncThunk(
  "posts/deletePost",
  async (postId, { rejectWithValue, getState }) => {
    try {
      // Check if it's a local-only post
      const post = getState().posts.items.find((p) => p.id === postId);
      const isLocal = post?.isLocal || String(postId).startsWith("local-");

      if (!isLocal) {
        await api.delete(`/posts/${postId}`);
      }
      
      return postId;
    } catch (err) {
      if (err.response?.status === 404) return postId; // Already gone
      return rejectWithValue("Delete failed");
    }
  }
);

// Slice Definition

const postsSlice = createSlice({
  name: "posts",
  initialState,
  reducers: {
    clearPostsState: () => initialState,
    
    clearError: (state) => {
      state.errorMsg = null;
    },
    
    // Optimistic update for likes (optional, but good UX)
    setLikeStatus: (state, action) => {
        const { postId, isLiked } = action.payload;
        const post = state.items.find(p => p.id === postId);
        if(post) {
            post.isLiked = isLiked;
            post.likeCount = isLiked ? post.likeCount + 1 : post.likeCount - 1;
        }
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch Posts
      .addCase(fetchPosts.pending, (state) => {
        state.isLoading = true;
        state.errorMsg = null;
      })
      .addCase(fetchPosts.fulfilled, (state, action) => {
        state.isLoading = false;
        const { posts, page, totalPages } = action.payload;

        // Replace if page 1, otherwise append
        state.items = page === 1 ? posts : [...state.items, ...posts];
        state.page = page;
        state.maxPages = totalPages;
        state.hasMoreItems = page < totalPages;
      })
      .addCase(fetchPosts.rejected, (state, action) => {
        state.isLoading = false;
        state.errorMsg = action.payload;
      })

      // Create Post
      .addCase(createPost.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      
      // Toggle Like
      .addCase(toggleLikePost.fulfilled, (state, action) => {
        const { postId, data } = action.payload;
        const post = state.items.find((p) => p.id === postId);
        if (post) {
            // Use server response if available, otherwise toggle logically
            post.isLiked = data.liked ?? data.isLiked ?? !post.isLiked;
            post.likeCount = data.likeCount ?? data.likes_count ?? post.likeCount;
        }
      })

      // Add Comment
      .addCase(submitComment.fulfilled, (state, action) => {
        const { postId, comment, offline } = action.payload;
        const post = state.items.find((p) => p.id === postId);
        if (post) {
          if (!post.comments) post.comments = [];
          
          // Normalize comment structure
          const normalizedComment = {
            id: comment.id,
            content: comment.content || comment.text,
            author: comment.author || { name: 'You' },
            created_at: comment.created_at || comment.createdAt || new Date().toISOString(),
            isLocal: comment.isLocal || false
          };
          
          post.comments.push(normalizedComment);
          post.commentCount = post.comments.length;
          
          // Always save comments to localStorage for persistence
          const localComments = getLocalComments();
          if (!localComments[postId]) {
            localComments[postId] = [];
          }
          
          // Check if comment already exists to avoid duplicates
          const existingIndex = localComments[postId].findIndex(c => c.id === normalizedComment.id);
          if (existingIndex === -1) {
            localComments[postId].push(normalizedComment);
            saveLocalComments(localComments);
            console.log('Saved comment to localStorage:', { postId, comment: normalizedComment, totalLocalComments: localComments });
          }
        }
      })

      // Delete Comment
      .addCase(deleteComment.fulfilled, (state, action) => {
        const { postId, commentId } = action.payload;
        const post = state.items.find((p) => p.id === postId);
        if (post && post.comments) {
          post.comments = post.comments.filter((c) => c.id !== commentId);
          post.commentCount = Math.max(0, post.commentCount - 1);
          
          // Also remove from localStorage
          const localComments = getLocalComments();
          if (localComments[postId]) {
            localComments[postId] = localComments[postId].filter(c => c.id !== commentId);
            if (localComments[postId].length === 0) {
              delete localComments[postId];
            }
            saveLocalComments(localComments);
          }
        }
      })

      // Delete Post
      .addCase(removePost.fulfilled, (state, action) => {
        const deletedId = action.payload;
        state.items = state.items.filter((p) => p.id !== deletedId);
        
        // Also remove from local storage if present
        const currentLocal = getOfflinePosts();
        const updatedLocal = currentLocal.filter(p => p.id !== deletedId);
        saveOfflinePosts(updatedLocal);
        
        // Remove post's comments from localStorage
        const localComments = getLocalComments();
        if (localComments[deletedId]) {
          delete localComments[deletedId];
          saveLocalComments(localComments);
        }
      });
  },
});

// Export Actions
export const { clearPostsState, clearError, setLikeStatus } = postsSlice.actions;

// Export Selectors
export const selectAllPosts = (state) => state.posts.items;
export const selectIsLoading = (state) => state.posts.isLoading;
export const selectError = (state) => state.posts.errorMsg;
export const selectPaginationInfo = (state) => ({
  currentPage: state.posts.page,
  totalPages: state.posts.maxPages,
  hasMore: state.posts.hasMoreItems,
});

export default postsSlice.reducer;
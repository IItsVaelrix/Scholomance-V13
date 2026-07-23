/** Frozen function-word set for content-token selection (PDR §3.2 anchor rule). */
export const STOPWORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into',
  'of', 'on', 'or', 'the', 'to', 'with', 'is', 'it', 'its', 'that', 'this',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might',
  'can', 'could', 'must', 'not', 'no', 'nor', 'so', 'if', 'then', 'than',
  'too', 'very', 'just', 'about', 'above', 'after', 'again', 'all', 'also',
  'am', 'any', 'because', 'before', 'between', 'both', 'each', 'few',
  'he', 'her', 'here', 'him', 'his', 'how', 'i', 'me', 'more', 'most',
  'my', 'myself', 'our', 'out', 'over', 'own', 'same', 'she', 'some',
  'such', 'them', 'there', 'these', 'they', 'those', 'through', 'under',
  'until', 'up', 'we', 'what', 'when', 'where', 'which', 'while', 'who',
  'whom', 'why', 'you', 'your',
]);

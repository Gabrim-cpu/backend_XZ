import { pool } from '../config/database.js';

export const handleAuth = async (req, res) => {
  const { uid, email, name: tokenName, picture } = req.firebaseUser;
  const { identity, language, picture: uploadedPicture, age, learn_interests, share_interests, name: bodyName } = req.body;
  const avatarUrl = uploadedPicture || picture || null;
  // The signup form sends the chosen name in the body. The ID token is minted
  // BEFORE updateProfile(displayName) runs client-side, so tokenName is often
  // missing on first sync — trusting it alone stores the email prefix instead.
  const name = bodyName || tokenName || null;
  
  try {
    let result = await pool.query(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [uid]
    );
    
    let user;
    let isNewUser = false;
    
    if (result.rows.length === 0) {
      // Check if email already exists in the database
      const emailCheck = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (emailCheck.rows.length > 0) {
        // Sync the old user with the new Firebase UID and updated details
        const updateResult = await pool.query(
          `UPDATE users
           SET firebase_uid = $1,
               display_name = COALESCE($2, display_name),
               avatar_url = COALESCE($3, avatar_url),
               identity = COALESCE($4, identity),
               language = COALESCE($5, language),
               age = COALESCE($6, age),
               learn_interests = COALESCE($7, learn_interests),
               share_interests = COALESCE($8, share_interests),
               last_seen_at = NOW()
           WHERE email = $9
           RETURNING *`,
          [
            uid,
            name,
            avatarUrl,
            identity || null,
            language || 'en',
            age ? parseInt(age, 10) : null,
            learn_interests || null,
            share_interests || null,
            email
          ]
        );
        user = updateResult.rows[0];
      } else {
        isNewUser = true;
        // New accounts always start NOT onboarded. Onboarding is completed
        // only by submitting the profile form (see updateProfile), regardless
        // of whether an identity was chosen at registration.
        // ON CONFLICT guards against the duplicate session-sync race where
        // onAuthStateChanged and the explicit signUp/signIn sync both INSERT.
        result = await pool.query(
          `INSERT INTO users (firebase_uid, email, display_name, identity, language, avatar_url, age, learn_interests, share_interests, is_onboarded)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
           ON CONFLICT (firebase_uid) DO UPDATE
             SET last_seen_at = NOW(),
                 identity = COALESCE(EXCLUDED.identity, users.identity),
                 language = COALESCE(EXCLUDED.language, users.language),
                 avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
                 age = COALESCE(EXCLUDED.age, users.age),
                 learn_interests = COALESCE(EXCLUDED.learn_interests, users.learn_interests),
                 share_interests = COALESCE(EXCLUDED.share_interests, users.share_interests)
           RETURNING *`,
          [
            uid,
            email,
            name || email.split('@')[0],
            identity || null,
            language || 'en',
            avatarUrl,
            age ? parseInt(age, 10) : null,
            learn_interests || null,
            share_interests || null
          ]
        );
        user = result.rows[0];
      }
    } else {
      user = result.rows[0];
      const updateResult = await pool.query(
        `UPDATE users
         SET last_seen_at = NOW(),
             avatar_url = COALESCE($1, avatar_url),
             identity = COALESCE($2, identity),
             language = COALESCE($3, language),
             age = COALESCE($4, age),
             learn_interests = COALESCE($5, learn_interests),
             share_interests = COALESCE($6, share_interests)
         WHERE id = $7
         RETURNING *`,
        [
          avatarUrl,
          identity || null,
          language || null,
          age ? parseInt(age, 10) : null,
          learn_interests || null,
          share_interests || null,
          user.id
        ]
      );
      user = updateResult.rows[0];
    }
    
    res.json({
      success: true,
      isNewUser,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        identity: user.identity,
        language: user.language,
        avatar_url: user.avatar_url,
        root_points: user.root_points || 0,
        is_onboarded: !!user.is_onboarded,
      }
    });
    
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Database error' });
  }
};


export const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [req.firebaseUser.uid]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateProfile = async (req, res) => {
  const { identity, language, display_name, avatar_url, age, bio, learn_interests, share_interests } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users
       SET identity = COALESCE($1, identity),
           language = COALESCE($2, language),
           display_name = COALESCE($3, display_name),
           avatar_url = COALESCE($4, avatar_url),
           age = COALESCE($5, age),
           bio = COALESCE($6, bio),
           learn_interests = COALESCE($7, learn_interests),
           share_interests = COALESCE($8, share_interests),
           is_onboarded = CASE WHEN $1 IS NOT NULL THEN true ELSE is_onboarded END
       WHERE firebase_uid = $9
       RETURNING *`,
      [identity, language, display_name, avatar_url, age, bio, learn_interests, share_interests, req.firebaseUser.uid]
    );

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

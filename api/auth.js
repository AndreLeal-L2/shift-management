const { supabase } = require('./config');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const { email, password } = req.body;
      
      // Simple hardcoded auth (in production, use Supabase Auth)
      if (email === 'admin@relleno.pt' && password === 'admin123') {
        const sessionToken = Math.random().toString(36).substring(2);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        const { error } = await supabase
          .from('sessions')
          .insert([{ session_token: sessionToken, expires_at: expiresAt.toISOString() }]);

        if (error) throw error;
        return res.status(200).json({ token: sessionToken });
      }
      
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (req.method === 'GET') {
      const { token } = req.query;
      
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('session_token', token)
        .single();

      if (error || !data) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      // Check if session is expired
      if (new Date(data.expires_at) < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }

      return res.status(200).json({ valid: true });
    }

    if (req.method === 'DELETE') {
      const { token } = req.query;
      
      await supabase
        .from('sessions')
        .delete()
        .eq('session_token', token);

      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

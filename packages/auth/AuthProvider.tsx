import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabase/client';
import { User, Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  supabase: typeof supabase; // Export supabase client for use in components
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Expose supabase globally for console access
    window.supabase = supabase;
    
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (session) {
        console.log('✅ Supabase auth session: active');
      }
      // Redirect to login if no session and not on login/callback page
      if (!session && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/auth/callback')) {
        navigate('/login', { replace: true });
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        // Redirect logic
        if (session && window.location.pathname === '/login') {
          navigate('/', { replace: true }); // Redirect to home after login
        } else if (!session && !window.location.pathname.includes('/login') && !window.location.pathname.includes('/auth/callback')) {
          navigate('/login', { replace: true }); // Redirect to login if session lost
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signIn = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut, supabase }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
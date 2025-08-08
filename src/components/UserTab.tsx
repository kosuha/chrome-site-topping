
import { useAuth } from '../contexts/AuthContext'
import styles from '../styles/UserTab.module.css'

export default function UserTab() {
  const { user, loading, error, signInWithProvider, signOut } = useAuth()

  if (loading) {
    return <div className={styles.loading}>Loading...</div>
  }

  if (user) {
    return (
      <div className={styles.container}>
        <div className={styles.userInfo}>
          <h3>Welcome, {user.email}!</h3>
          <p>You are signed in</p>
          {user.user_metadata?.avatar_url && (
            <img 
              src={user.user_metadata.avatar_url} 
              alt="Profile" 
              className={styles.avatar}
            />
          )}
        </div>
        <button 
          onClick={signOut}
          className={styles.signOutButton}
        >
          Sign Out
        </button>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h3>Sign In</h3>
      {error && <div className={styles.error}>{error}</div>}
      
      <div className={styles.providers}>
        <button 
          onClick={() => signInWithProvider('google')}
          className={`${styles.provider} ${styles.google}`}
        >
          Continue with Google
        </button>
        
        <button 
          onClick={() => signInWithProvider('kakao')}
          className={`${styles.provider} ${styles.kakao}`}
        >
          Continue with Kakao
        </button>
      </div>
    </div>
  )
}
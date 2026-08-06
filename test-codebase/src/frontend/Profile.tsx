import { useState } from 'react';
import type { User } from '../types';

export function Profile({ user }: { user: User }) {
  const [count, setCount] = useState(0);
  return (
    <div onClick={() => setCount(count + 1)}>
      <h1>{user.name}</h1>
    </div>
  );
}

export default Profile;

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function AddUserForm({ onAddUser }) {
  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const newUser = {
      id: Math.random().toString(36).substr(2, 9), // Random ID
      name: `${firstName} ${name}`,
      email,
      createdOn: new Date().toLocaleString(),
      roles: ['BA'], // Default role as per requirements
      status: 'Disabled',
    };
    onAddUser(newUser);
  }

  return (
    <div className="m-auto px-5 pb-8 pt-5 @lg:pt-6 @2xl:px-7">
      <div className="mb-6 flex items-center justify-between">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-700">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 block w-full rounded-md border p-2"
              required
            />
          </div>
          <div>
            <label className="block text-gray-700">Last Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border p-2"
              required
            />
          </div>
          <div>
            <label className="block text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border p-2"
              required
            />
          </div>
          <Button type="submit" className="mt-4 bg-blue-600 text-white">
            Add
          </Button>
        </form>
      </div>
    </div>
  );
}

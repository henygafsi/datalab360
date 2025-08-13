'use client';

import Link from 'next/link';
import { HiOutlineSparkles } from 'react-icons/hi2';
import HamburgerButton from '@/layouts/hamburger-button';
import Sidebar from '@/layouts/hydrogen/sidebar';
import HeaderMenuRight from '@/layouts/header-menu-right';
import StickyHeader from '@/layouts/sticky-header';
import SearchWidget from '@/app/shared/search/search';
import { Badge } from 'rizzui';
import { useState, useEffect } from 'react';

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <StickyHeader className={`z-40 transition-all duration-300 ${
      isScrolled 
        ? 'border-b border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-900/5 dark:shadow-slate-900/20' 
        : 'border-b border-slate-200/30 dark:border-slate-700/30'
    }`}>
      {/* Enhanced Glassmorphism background */}
      <div className={`absolute inset-0 transition-all duration-300 ${
        isScrolled 
          ? 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl' 
          : 'bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl'
      }`} />
      <div className="absolute inset-0 bg-gradient-to-r from-white/60 via-white/40 to-white/20 dark:from-slate-900/60 dark:via-slate-900/40 dark:to-slate-900/20" />
      
      {/* Subtle grid pattern overlay */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02] bg-[radial-gradient(circle_at_1px_1px,_rgb(0,0,0)_1px,_transparent_0)] bg-[length:20px_20px]" />
      
      {/* Content */}
      <div className="relative flex items-center justify-between px-6 py-3 lg:px-8">
        {/* Left section */}
        <div className="flex items-center space-x-4">
          {/* Mobile menu button with enhanced styling */}
          <div className="lg:hidden">
            <HamburgerButton
              view={<Sidebar className="static w-full 2xl:w-full" />}
            />
          </div>
          
          {/* Enhanced Mobile logo */}
          <Link
            href={'/'}
            aria-label="Data360 Dashboard"
            className="xl:hidden flex items-center space-x-3 group transition-all duration-300 hover:scale-105"
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300">
                <HiOutlineSparkles className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-blue-500/20 via-purple-600/20 to-pink-500/20 blur opacity-0 group-hover:opacity-100 transition-all duration-300" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold bg-gradient-to-r from-slate-900 via-blue-600 to-purple-600 dark:from-white dark:via-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                Data360
              </span>
              <Badge className="bg-blue-100/80 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs px-2 py-0 font-medium">
                Analytics
              </Badge>
            </div>
          </Link>
        </div>

        {/* Center section - Enhanced Search */}
        <div className="hidden md:block flex-1 max-w-2xl mx-8">
          <SearchWidget 
            className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all duration-200 shadow-sm hover:shadow-md"
            placeholderClassName="text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200"
          />
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-3">
          <HeaderMenuRight />
        </div>
      </div>

      {/* Mobile search */}
      <div className="md:hidden px-6 pb-4">
        <SearchWidget />
      </div>
    </StickyHeader>
  );
}

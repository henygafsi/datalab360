'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Title, Button } from 'rizzui';
import { PiHouseLineBold, PiSignInBold } from 'react-icons/pi';
import { useSession } from 'next-auth/react';
import { siteConfig } from '@/config/site.config';
import NotFoundImg from '@public/not-found.png';

export default function NotFound() {
  const { status } = useSession();
  const isUnauthenticated = status === 'unauthenticated';

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FAFC]">
      <div className="sticky top-0 z-40 flex justify-center py-5 backdrop-blur-lg lg:backdrop-blur-none xl:py-10">
        <Link href="/" aria-label="Data360 home">
          <Image
            src={siteConfig.logo}
            alt="Data360"
            className="dark:invert"
            priority
          />
        </Link>
      </div>

      <div className="flex grow items-center px-6 xl:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <Image
            src={NotFoundImg}
            alt=""
            aria-hidden="true"
            className="mx-auto mb-8 aspect-[360/326] max-w-[256px] xs:max-w-[370px] lg:mb-12 2xl:mb-16"
          />
          <Title
            as="h1"
            className="text-[22px] font-bold leading-normal text-gray-1000 lg:text-3xl"
          >
            Page not found
          </Title>
          <p className="mt-3 text-sm leading-loose text-gray-500 lg:mt-6 lg:text-base lg:leading-loose">
            The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
            If you followed a link from inside Data360, please report this so we can fix it.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/account-overview">
              <Button
                as="span"
                size="xl"
                color="primary"
                className="h-12 px-4 xl:h-14 xl:px-6"
              >
                <PiHouseLineBold className="mr-1.5 text-lg" aria-hidden="true" />
                Back to Account Overview
              </Button>
            </Link>
            {isUnauthenticated && (
              <Link href="/signin">
                <Button
                  as="span"
                  size="xl"
                  variant="outline"
                  className="h-12 px-4 xl:h-14 xl:px-6"
                >
                  <PiSignInBold className="mr-1.5 text-lg" aria-hidden="true" />
                  Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import { HomeLoadError } from '@/components/HomeLoadingBoundary';
export default function Error({ reset }: { reset: () => void }) { return <HomeLoadError reset={reset} />; }

"use client";

import dynamic from "next/dynamic";
import { StageLoading } from "@/components/StageLoading";

const RaceSession = dynamic(() => import("@/components/RaceSession").then((mod) => mod.RaceSession), {
  ssr: false,
  loading: () => <StageLoading progress={0} />,
});

export default function HomePage() {
  return <RaceSession />;
}

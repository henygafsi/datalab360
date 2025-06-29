import { affiliateStatData } from "@/data/affiliate.data";
import cn from "@core/utils/class-names";
import { toCurrency } from "@core/utils/to-currency";
import { PiTrendUpBold } from "react-icons/pi";
import { Box, Flex, Text } from "rizzui";

type AffiliateStatsDataType = (typeof affiliateStatData)[number];

export type StatCardProps = {
  className?: string;
  statItem: AffiliateStatsDataType;
};

export default function AffiliateStats({ className }: { className?: string }) {
  return (
    <Box className={cn("@container", className)}>
      <Box className="grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-4 gap-6 3xl:gap-8">
        {affiliateStatData.map((stat: AffiliateStatsDataType, index: number) => {
          return (
            <StatCard
              key={"stat-card-" + index}
              statItem={stat}
            />
          );
        })}
      </Box>
    </Box>
  );
}

function StatCard({ className, statItem }: StatCardProps) {
  const { icon, title, amount, iconColor, increasedPercentage } = statItem;
  const Icon = icon;
  return (
    <Box
      className={cn(
        "inline-block relative overflow-hidden w-full rounded-lg p-4 @6xl:p-6 border border-muted hover:shadow transition-shadow duration-300 dark:bg-[#181818] dark:bg-none",
        className
      )}
    >
      <Box className="absolute size-20 rounded-3xl bg-gray-200/50 hidden dark:block -top-10 end-0 rotate-45" />
      <Flex
        align="start"
        justify="between"
        gap="2"
      >
        <Flex
          align="center"
          justify="center"
          className="size-12 rounded-lg shadow-[0px_2px_10px_0px_#7C8DB51F] dark:shadow-none border border-muted/70 mb-3"
        >
          <Icon
            className="size-[22px]"
            style={{
              color: iconColor,
            }}
          />
        </Flex>
        <Flex
          gap="1"
          align="center"
          className="text-green w-auto z-10"
        >
          <PiTrendUpBold className="size-4" />
          <span>{increasedPercentage}%</span>
        </Flex>
      </Flex>

      <Text className="text-gray-700 dark:text-gray-500">{title}</Text>

      <Text className="text-2xl font-semibold leading-none text-gray-900 dark:text-gray-700 my-3">
        {toCurrency(amount)}
      </Text>

      <SvgComponent className="absolute bottom-2 right-2 size-16" />
    </Box>
  );
}

function SvgComponent({ ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 122 122"
      fill="none"
      {...props}
    >
      <g opacity={0.03}>
        <mask
          id="a"
          width={122}
          height={122}
          x={0}
          y={0}
          maskUnits="userSpaceOnUse"
          style={{
            maskType: "luminance",
          }}
        >
          <path
            fill="#fff"
            d="M0 0h122v122H0V0z"
          />
        </mask>
        <g
          stroke="#000"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeMiterlimit={10}
          strokeWidth={4}
          mask="url(#a)"
        >
          <path d="M106.94 72.485c0 15.845-6.431 30.201-16.825 40.6l-40.6-40.6h57.425z" />
          <path d="M49.515 72.485l32.479 32.479c-8.317 8.317-19.802 13.462-32.48 13.462-25.353 0-45.94-20.587-45.94-45.94 0-25.354 20.587-45.941 45.94-45.941v45.94z" />
          <path d="M49.515 3.574c38.035 0 68.911 30.876 68.911 68.911H49.515V3.575z" />
        </g>
      </g>
    </svg>
  );
}

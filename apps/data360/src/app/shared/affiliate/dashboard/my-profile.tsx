import Image from "next/image";
import cn from "@core/utils/class-names";
import WidgetCard from "@core/components/cards/widget-card";
import { PiNotePencil, PiShieldCheckFill } from "react-icons/pi";
import { ActionIcon, Box, Flex, Progressbar, Text, Title } from "rizzui";

const userInfo = {
  name: "Gareth Albuz",
  username: "@gareth_1234",
  avatar: "/social-avatar.webp",
  profileInfo: [
    {
      title: "Contact Info",
      value: "+12 3456 7890",
    },
    {
      title: "Payment",
      value: "+12 3456 7890",
    },
  ],
  progress: {
    title: "Performance",
    value: 62,
  },
};

export default function MyProfile({ className }: { className?: string }) {
  return (
    <WidgetCard
      title="My Profile"
      className={cn("@container dark:bg-[#181818]", className)}
      headerClassName="items-center"
      action={
        <ActionIcon
          rounded="full"
          variant="outline"
        >
          <PiNotePencil className="size-4" />
        </ActionIcon>
      }
    >
      <Flex
        justify="center"
        align="center"
        direction="col"
        className="mt-8 gap-0 space-y-6"
      >
        <Box className="relative rounded-full bg-[#464CDA]/30 p-2">
          <Image
            src={userInfo.avatar}
            width={80}
            height={80}
            alt="avatar"
            quality={100}
            className="size-20 rounded-full"
          />
          <BorderSvg className="absolute -inset-4" />
        </Box>

        <Box className="text-center">
          <Title className="text-xl font-medium capitalize relative">
            {userInfo.name}
            <PiShieldCheckFill className="size-4 text-green absolute top-0 -end-5" />
          </Title>
          <Text>{userInfo.username}</Text>
        </Box>
        <Flex
          justify="center"
          align="center"
          direction="col"
          className="@xs:flex-row"
        >
          {userInfo.profileInfo.map((info) => (
            <Box
              key={info.title}
              className="px-4 py-3 bg-gray-50 w-full space-y-0.5 border border-muted rounded-lg @lg:max-w-48"
            >
              <Text>{info.title}</Text>
              <Text className="text-base font-semibold text-gray-900">{info.value}</Text>
            </Box>
          ))}
        </Flex>

        <Box className="w-full space-y-2 text-gray-900">
          <Text className="font-semibold text-base">{userInfo.progress.title}</Text>
          <Progressbar
            size="xl"
            value={userInfo.progress.value}
            label={userInfo.progress.value.toString() + "%"}
            labelPosition="insideBar"
            trackClassName="h-10"
            barClassName="bg-[#464CDA] justify-end pe-2 min-w-16"
            labelClassName="bg-white px-3 py-1 rounded-full text-gray-900 dark:text-gray-100"
          />
        </Box>
      </Flex>
    </WidgetCard>
  );
}

function BorderSvg({ ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 132 132"
      fill="none"
      {...props}
    >
      <path
        fill="#464CDA"
        d="M5.717 92.869A66 66 0 015.18 40.37l3.837 1.617a61.836 61.836 0 00.503 49.187l-3.803 1.695z"
      />
      <path
        fill="#464CDA"
        d="M7.12 36.182A66 66 0 0163.186.06l.177 4.16a61.837 61.837 0 00-52.529 33.843L7.12 36.182z"
      />
      <path
        fill="#464CDA"
        d="M67.586.02a66 66 0 0154.817 31.706l-3.558 2.162A61.841 61.841 0 0067.486 4.182l.1-4.163z"
      />
      <path
        fill="#464CDA"
        d="M124.687 35.804a65.991 65.991 0 01.708 58.975l-3.747-1.816a61.835 61.835 0 00-.663-55.254l3.702-1.905z"
      />
    </svg>
  );
}

import {
  Anchor,
  Button,
  Center,
  Container,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import Link from "next/link";
import Logo from "../../components/Logo";
import Meta from "../../components/Meta";

const Intro = () => {
  return (
    <>
      <Meta title="Intro" />
      <Container size="xs">
        <Stack>
          <Center>
            <Logo height={80} width={80} />
          </Center>
          <Center>
            <Title order={2}>Welcome to Better Pingvin Share</Title>
          </Center>
          <Text>
            If you enjoy Better Pingvin Share please ⭐️ it on{" "}
            <Anchor
              target="_blank"
              href="https://github.com/CodeBoy2006/better-pingvin-share"
            >
              GitHub
            </Anchor>{" "}
            or{" "}
            <Anchor
              target="_blank"
              href="https://github.com/sponsors/stonith404"
            >
              buy me a coffee
            </Anchor>{" "}
            if you want to support my work.
          </Text>
          <Text>Enough talked, have fun with Better Pingvin Share!</Text>
          <Text mt="lg">How to you want to continue?</Text>
          <Stack>
            <Button href="/admin/config/general" component={Link}>
              Customize configuration
            </Button>
            <Button href="/" component={Link} variant="light">
              Explore Better Pingvin Share
            </Button>
          </Stack>
        </Stack>
      </Container>
    </>
  );
};

export default Intro;

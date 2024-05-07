import {
  Heading,
  Html,
  Container,
  Text,
  Section,
  Img,
  Button,
} from "@react-email/components";
import * as React from "react";

export interface FppSenderMailProps {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export default function FppSenderMailProps({
  name = "John Doe",
  email = "john.doe@gmail.com",
  subject = "Hello World!",
  message = "Hello, I am interested in your product",
}: FppSenderMailProps) {
  return (
    <Html style={{ fontFamily: "sans-serif" }}>
      <Container>
        <Section
          style={{
            marginTop: 40,
            marginBottom: 40,
          }}
        >
          <Img
            src="https://free-planning-poker.com/logo.svg"
            alt="Logo"
            width="90"
            height="90"
            style={{
              marginLeft: "auto",
              marginRight: "auto",
            }}
          />
          <Heading
            as="h1"
            style={{
              textAlign: "center",
              color: "#1971C2",
            }}
          >
            Free-Planning-Poker.com
          </Heading>
        </Section>
        <Section>
          <Heading as="h2">Thanks for submitting our contact form!</Heading>
          <Text>We will answer your message as soon as possible.</Text>
          <Button
            href="https://free-planning-poker.com/"
            style={{
              marginTop: 20,
              marginBottom: 50,
              backgroundColor: "#1971C2",
              color: "#ffffff",
              padding: "15px 30px",
              borderRadius: 3,
              textDecoration: "none",
              display: "inline-block",
            }}
            target="_blank"
          >
            Go back to planning
          </Button>
        </Section>
        <Section>
          <Heading as="h2">Your submission</Heading>
        </Section>
        <Section>
          <Heading as="h3">Name</Heading>
          <Text>{name}</Text>
        </Section>
        <Section>
          <Heading as="h3">Email</Heading>
          <Text>{email}</Text>
        </Section>
        <Section>
          <Heading as="h3">Subject</Heading>
          <Text>{subject}</Text>
        </Section>
        <Section>
          <Heading as="h3">Message</Heading>
          <Text>{message}</Text>
        </Section>
      </Container>
    </Html>
  );
}

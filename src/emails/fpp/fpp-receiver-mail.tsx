import {
  Heading,
  Html,
  Container,
  Text,
  Section,
  Img,
} from "@react-email/components";
import * as React from "react";

export interface FppReceiverProps {
  name: string | null;
  email: string;
  subject: string | null;
  message: string | null;
}

export default function FppReceiverMail({
  name = "John Doe",
  email = "john.doe@gmail.com",
  subject = "Hello World!",
  message = "Hello, I am interested in your product",
}: FppReceiverProps) {
  return (
    <Html style={{ fontFamily: "sans-serif" }}>
      <Container>
        <Section
          style={{
            marginTop: 40,
            marginBottom: 40,
          }}
        >
          <Heading
            as="h1"
            style={{
              textAlign: "center",
              fontWeight: "bold",
              color: "#1971C2",
            }}
          >
            Free-Planning-Poker.com
          </Heading>
        </Section>
        <Section>
          <Heading as="h2">New form submission! 🎉</Heading>
          <Text>We have received a contact form submission.</Text>
        </Section>
        <Section
          style={{
            marginTop: 30,
          }}
        >
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

import { Heading, Text, Section } from "@react-email/components";
import * as React from "react";
import SySerendipityLayout from "../../layouts/sy-serendipity.layout";

export interface SySerendipityRequestProps {
  firstName: string | null;
  lastName: string | null;
  email: string;
  numberOfPeople: string | null;
  destination: string | null;
  duration: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  phone: string | null;
  message: string | null;
}

function displayValue(value: string | null) {
  return value && value.trim().length > 0 ? value : "—";
}

export default function SySerendipityRequestMail({
  firstName = "John",
  lastName = "Doe",
  email = "john.doe@gmail.com",
  numberOfPeople = "4",
  destination = "Cyclades",
  duration = "7 days",
  arrivalDate = "2026-06-01",
  departureDate = "2026-06-08",
  phone = "+30 123 456 7890",
  message = "Looking forward to hearing from you!",
}: SySerendipityRequestProps) {
  return (
    <SySerendipityLayout>
      <Section>
        <Heading as="h2">New charter request 🛥️</Heading>
        <Text>
          A guest requested a trip on SY Serendipity I via the website.
        </Text>
      </Section>
      <Section
        style={{
          marginTop: 30,
        }}
      >
        <Heading as="h3">Destination</Heading>
        <Text>{displayValue(destination)}</Text>
      </Section>
      <Section>
        <Heading as="h3">Arrival Date</Heading>
        <Text>{displayValue(arrivalDate)}</Text>
      </Section>
      <Section>
        <Heading as="h3">Departure Date</Heading>
        <Text>{displayValue(departureDate)}</Text>
      </Section>
      <Section>
        <Heading as="h3">Duration</Heading>
        <Text>{displayValue(duration)}</Text>
      </Section>
      <Section>
        <Heading as="h3">Number of People</Heading>
        <Text>{displayValue(numberOfPeople)}</Text>
      </Section>
      <Section>
        <Heading as="h3">Name</Heading>
        <Text>
          {displayValue(
            [firstName, lastName].filter(Boolean).join(" ") || null,
          )}
        </Text>
      </Section>
      <Section>
        <Heading as="h3">Email</Heading>
        <Text>{email}</Text>
      </Section>
      <Section>
        <Heading as="h3">Phone</Heading>
        <Text>{displayValue(phone)}</Text>
      </Section>
      <Section>
        <Heading as="h3">Message</Heading>
        <Text>{displayValue(message)}</Text>
      </Section>
    </SySerendipityLayout>
  );
}

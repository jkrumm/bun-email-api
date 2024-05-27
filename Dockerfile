# Use the official Bun image as a base image
FROM oven/bun

# Set the working directory in the container
WORKDIR /usr/src/app

# Install git and other package dependencies
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y git

# Copy the contents from the local directory into the container
COPY . /usr/src/app

# Set the working directory in the container to your app directory
WORKDIR /usr/src/app

# Verify that the package.json file exists
RUN if [ ! -f ./package.json ]; then echo "Error: package.json not found!"; exit 1; fi

# Install any needed packages
RUN bun install

# Set the environment variables
ENV NODE_ENV production

# Make port 3010 available to the world outside this container
EXPOSE 3010

# Run the app
CMD ["bun", "run", "src/index.ts"]

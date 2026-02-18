FROM node:22-slim

# install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl

# creates the working directory
WORKDIR /usr/src/app

# copy dependency files
# only the dependencies are copied and not all of files, so if this stage has not been changed in comparison to the cache, 'npm ci' does not need to be run afterwards
# RUN command only runs if the previous stage has been changed
COPY package*.json ./

# install project dependencies from scratch
# --omit-dev is not used because some dev dependencies are used to build the project
RUN npm ci

# copy schema.prisma
COPY --chown=node:node prisma/schema.prisma ./prisma/schema.prisma

# generates the prisma code, it is done after COPY for cache reasons
# docker does not run RUN commands without the previous layer having been changed
RUN npx prisma generate

# copy projects files to working directory, ignoring the content from .dockerignore
COPY --chown=node:node . .

# run the build command that creates the production package
RUN npm run build

# does the next steps as the 'node' user
# node images have a non-root 'node' user by default
USER node

# runs the project
CMD [ "node", "dist/src/main.js" ]
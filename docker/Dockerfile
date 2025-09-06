###############
#### BUILD ####
###############

# uses node alpine as base
FROM node:22-alpine AS build

# does the next steps as the 'node' user
# node images have a non-root 'node' user by default
USER node

# creates the working directory
WORKDIR /usr/src/app

# copy projects files to working directory, ignoring the content from .dockerignore
COPY --chown=node:node . .

# install project dependencies from scratch
# --omit-dev is not used because some dev dependencies are used to build the project
RUN npm ci

# builds de project
RUN npm run build

# install dependencies agains, this time ignoring dev dependencies
RUN npm ci --omit=dev && npm cache clean --force

# generates prisma code
RUN npx prisma generate

####################
#### PRODUCTION ####
####################

# uses node alpine as base
FROM node:22-alpine AS production

# does the next steps as the 'node' user
# node images have a non-root 'node' user by default
USER node

# copies the depdencies from build stage
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules

# copies the project dist files from the build stage
COPY --chown=node:node --from=build /usr/src/app/dist ./dist

# runs the project
CMD [ "node", "dist/main.js" ]
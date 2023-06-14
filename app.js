const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server is running at http://localhost:3000/")
    );
  } catch (Error) {
    console.log(`DB Error ${Error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//Create User Register API
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length > 5) {
      const createUserQuery = `
      INSERT INTO user (username, password, name, gender)
      VALUES (
          '${username}',
          '${hashedPassword}',
          '${name}',
          '${gender}'
      );
      `;
      await db.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//User login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const loginUserDetails = await db.get(selectUserQuery);
  if (loginUserDetails !== undefined) {
    const isPasswordMatched = await bcrypt.compare(
      password,
      loginUserDetails.password
    );
    if (isPasswordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "It's_My_Secret");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//Authentication jwt Token
const AuthenticateJwtToken = (request, response, next) => {
  let jwtToken;
  const AuthHeader = request.headers["authorization"];
  if (AuthHeader !== undefined) {
    jwtToken = AuthHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "It's_My_Secret", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 3
app.get(
  "/user/tweets/feed/",
  AuthenticateJwtToken,
  async (request, response) => {
    try {
      let { username } = request;
      // console.log(username);
      const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
      const getUserId = await db.get(getUserIdQuery);
      const { user_id } = getUserId;
      const getUserTweetsQuery = `
        SELECT 
            user.username,
            tweet.tweet,
            tweet.date_time AS dateTime
        FROM (tweet INNER JOIN user 
        ON tweet.user_id = user.user_id) AS T
        INNER JOIN follower 
        ON T.user_id = follower.following_user_id
        WHERE follower.follower_user_id=${user_id}
        ORDER BY tweet.date_time DESC
        LIMIT 4;
        `;
      const getUserTweetsDetails = await db.all(getUserTweetsQuery);
      response.send(getUserTweetsDetails);
    } catch (e) {
      console.log(e.message);
    }
  }
);

//API 4
app.get("/user/following/", AuthenticateJwtToken, async (request, response) => {
  try {
    let { username } = request;
    // console.log(username);
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const getUserId = await db.get(getUserIdQuery);
    const { user_id } = getUserId;
    const getUserFollowersQuery = `SELECT user.name 
    FROM follower INNER JOIN user 
    ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${user_id};`;
    const userFollowerDetails = await db.all(getUserFollowersQuery);
    response.send(userFollowerDetails);
  } catch (error) {
    console.log(error.message);
  }
});

//API 5
app.get("/user/followers/", AuthenticateJwtToken, async (request, response) => {
  try {
    let { username } = request;
    // console.log(username);
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const getUserId = await db.get(getUserIdQuery);
    const { user_id } = getUserId;
    const getUserFollowersQuery = `SELECT user.name 
    FROM follower INNER JOIN user 
    ON follower.follower_user_id = user.user_id
    WHERE follower.following_user_id = ${user_id};`;
    const userFollowerDetails = await db.all(getUserFollowersQuery);
    response.send(userFollowerDetails);
  } catch (error) {
    console.log(error.message);
  }
});

//API 6
app.get(
  "/tweets/:tweetId/",
  AuthenticateJwtToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const getUserId = await db.get(getUserIdQuery);
    const { user_id } = getUserId;
    const getTweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetsDetails = await db.get(getTweetsQuery);
    // console.log(tweetsDetails);
    const userFollowingTweetsQuery = `
        SELECT * FROM follower INNER JOIN user 
        ON follower.following_user_id = user.user_id
        WHERE follower.follower_user_id = ${user_id};
    `;
    const userFollowingTweetsDetails = await db.all(userFollowingTweetsQuery);
    // console.log(userFollowingTweetsDetails);
    if (
      userFollowingTweetsDetails.some(
        (eachItem) => eachItem.following_user_id === tweetsDetails.user_id
      )
    ) {
      const getTweetsQuery = `
            SELECT tweet.tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM (tweet INNER JOIN like 
            ON tweet.tweet_id = like.tweet_id) AS T INNER JOIN reply
            ON T.tweet_id = reply.tweet_id
        WHERE tweet.tweet_id = ${tweetId};
        `;
      const getTweetDetails = await db.get(getTweetsQuery);
      response.send(getTweetDetails);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  AuthenticateJwtToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const getUserId = await db.get(getUserIdQuery);
    const { user_id } = getUserId;
    const userFollowerLikedQuery = `
        SELECT * FROM follower INNER JOIN tweet 
        ON follower.following_user_id = tweet.user_id INNER JOIN like
        ON like.tweet_id = tweet.tweet_id INNER JOIN user
        ON user.user_id = like.user_id
        WHERE tweet.tweet_id=${tweetId} AND follower.follower_user_id=${user_id};`;
    const userLikedTweetsDetails = await db.all(userFollowerLikedQuery);
    if (userLikedTweetsDetails.length !== 0) {
      let likes = [];
      for (let item of userLikedTweetsDetails) {
        likes.push(item.username);
      }
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  AuthenticateJwtToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const getUserId = await db.get(getUserIdQuery);
    const { user_id } = getUserId;
    const userFollowerRepliesQuery = `
        SELECT * FROM follower INNER JOIN tweet 
        ON follower.following_user_id = tweet.user_id INNER JOIN reply
        ON reply.tweet_id = tweet.tweet_id INNER JOIN user
        ON user.user_id = reply.user_id
        WHERE tweet.tweet_id=${tweetId} AND follower.follower_user_id=${user_id};`;
    const userFollowerRepliesDetails = await db.all(userFollowerRepliesQuery);
    if (userFollowerRepliesDetails.length !== 0) {
      let replies = [];
      for (let item of userFollowerRepliesDetails) {
        replies.push({ name: item.name, reply: item.reply });
      }
      response.send({ replies });
    } else {
      response.status(401);
      -response.send("Invalid Request");
    }
  }
);

//API 9
app.get("/user/tweets/", AuthenticateJwtToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const getUserId = await db.get(getUserIdQuery);
  const { user_id } = getUserId;
  const getUserTweetsQuery = `
            SELECT tweet.tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM ((tweet INNER JOIN user 
            ON tweet.user_id = user.user_id) AS T INNER JOIN like
            ON T.tweet_id = like.tweet_id) AS Y INNER JOIN reply
            ON Y.tweet_id = reply.tweet_id
        WHERE user.user_id = ${user_id}
        GROUP BY tweet.tweet_id;
        `;
  const getUserTweetDetails = await db.all(getUserTweetsQuery);
  response.send(getUserTweetDetails);
});

//API 10
app.post("/user/tweets/", AuthenticateJwtToken, async (request, response) => {
  let { username } = request;
  const { tweet } = request.body;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const getUserId = await db.get(getUserIdQuery);
  const { user_id } = getUserId;
  const createUserTweetQuery = `
    INSERT INTO tweet (tweet)
    VALUES ('${tweet}');
  `;
  await db.run(createUserTweetQuery);
  response.send("Created a Tweet");
});

//API 6
app.delete(
  "/tweets/:tweetId/",
  AuthenticateJwtToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const getUserId = await db.get(getUserIdQuery);
    const { user_id } = getUserId;
    const getTweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId} AND user_id=${user_id};`;
    const tweetsDetails = await db.all(getTweetsQuery);
    // console.log(tweetsDetails);
    if (tweetsDetails.length !== 0) {
      const deleteTweetsQuery = `
            DELETE FROM tweet
        WHERE tweet_id = ${tweetId} AND user_id=${user_id};
        `;
      await db.get(deleteTweetsQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Export App module
module.exports = app;

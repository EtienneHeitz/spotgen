var Queue = require('./queue')
var SpotifyRequestHandler = require('./spotify')
var Track = require('./track')

/**
 * Create album entry.
 * @constructor
 * @param {SpotifyRequestHandler} spotify - Spotify request handler.
 * @param {string} entry - The album to search for.
 * @param {string} [id] - The Spotify ID, if known.
 * @param {string} [limit] - The number of tracks to fetch.
 */
function Album (spotify, entry, id, limit) {
  /**
   * Album response.
   *
   * [Reference](https://developer.spotify.com/web-api/object-model/#album-object-full).
   */
  this.albumResponse = null

  /**
   * Entry string.
   */
  this.entry = entry.trim()

  /**
   * Number of albums to fetch.
   */
  this.limit = null

  /**
   * Search response.
   *
   * [Reference](https://developer.spotify.com/web-api/search-item/#example).
   */
  this.searchResponse = null

  /**
   * Whether to fetch tracks.
   */
  this.fetchTracks = true

  /**
   * Spotify request handler.
   */
  this.spotify = spotify || new SpotifyRequestHandler()

  /**
   * Spotify ID.
   */
  this.id = id

  this.setLimit(limit)
}

/**
 * Create a queue of tracks.
 * @param {JSON} response - A JSON response object.
 * @return {Promise | Queue} A queue of tracks.
 */
Album.prototype.createQueue = function () {
  var self = this
  var tracks = this.albumResponse.tracks.items.map(function (item) {
    var track = new Track(self.spotify, self.entry)
    track.setResponse(item)
    track.setAlbum(self.title())
    return track
  })
  var queue = new Queue(tracks)
  if (self.limit) {
    queue = queue.slice(0, self.limit)
  }
  return queue
}

/**
 * Dispatch entry.
 * @return {Promise | Queue} A queue of tracks.
 */
Album.prototype.dispatch = function () {
  if (this.fetchTracks) {
    var self = this
    return this.searchForAlbum().then(function () {
      return self.fetchAlbum()
    }).then(function () {
      return self.createQueue()
    })
  } else {
    return this.searchForAlbum()
  }
}

/**
 * Fetch album metadata.
 * @return {Promise | JSON} A JSON response.
 */
Album.prototype.fetchAlbum = function () {
  var self = this
  return this.spotify.getAlbum(this.id).then(function (response) {
    self.albumResponse = response
    return self
  })
}

/**
 * The album popularity.
 * @return {string} - The album popularity.
 */
Album.prototype.popularity = function () {
  if (this.albumResponse &&
      this.albumResponse.popularity) {
    return this.albumResponse.popularity
  } else if (this.searchResponse &&
             this.searchResponse.albums &&
             this.searchResponse.albums.items[0] &&
             this.searchResponse.albums.items[0].popularity) {
    return this.searchResponse.albums.items[0].popularity
  } else {
    return ''
  }
}

/**
 * Search for album if not known.
 * @return {Promise | JSON} A JSON response, or `null` if not found.
 */
Album.prototype.searchForAlbum = function () {
  var self = this
  if (this.searchResponse) {
    return Promise.resolve(this.searchResponse)
  } else if (this.albumResponse) {
    return Promise.resolve(this.albumResponse)
  } else if (this.id) {
    return Promise.resolve(this.id)
  } else {
    return this.spotify.searchForAlbum(this.entry).then(function (result) {
      self.searchResponse = result
      if (self.searchResponse &&
          self.searchResponse.albums &&
          self.searchResponse.albums.items &&
          self.searchResponse.albums.items[0] &&
          self.searchResponse.albums.items[0].id) {
        self.id = self.searchResponse.albums.items[0].id
      }
      return self
    }).catch(function () {
      if (self.entry.match(/[0-9a-z]+$/i)) {
        self.id = self.entry
        return Promise.resolve(self.id)
      } else {
        console.log('COULD NOT FIND ' + self.entry)
        return Promise.reject(null)
      }
    })
  }
}

/**
 * Set the number of tracks to fetch.
 * @param {integer} limit - The maximum amount of tracks.
 */
Album.prototype.setLimit = function (limit) {
  if (Number.isInteger(limit)) {
    this.limit = limit
  }
}

/**
 * Set the JSON response.
 * @param {JSON} response - The response.
 */
Album.prototype.setResponse = function (response) {
  if (response &&
      response.albums &&
      response.albums.items[0] &&
      response.albums.items[0].id) {
    this.searchResponse = response
    this.id = response.id
  } else if (response &&
             response.id) {
    this.albumResponse = response
    this.id = response.id
  }
}

/**
 * The album title.
 * @return {string} - The album title.
 */
Album.prototype.title = function () {
  if (this.albumResponse &&
      this.albumResponse.name) {
    return this.albumResponse.name
  } else if (this.searchResponse &&
             this.searchResponse.albums &&
             this.searchResponse.albums.items[0] &&
             this.searchResponse.albums.items[0].name) {
    return this.searchResponse.albums.items[0].name
  } else {
    return ''
  }
}

/**
 * The album type.
 * @return {string} - The album type.
 */
Album.prototype.type = function () {
  if (this.albumResponse &&
      this.albumResponse.album_type) {
    return this.albumResponse.album_type
  } else if (this.searchResponse &&
             this.searchResponse.albums &&
             this.searchResponse.albums.items[0] &&
             this.searchResponse.albums.items[0].album_type) {
    return this.searchResponse.albums.items[0].album_type
  } else {
    return ''
  }
}

/**
 * Spotify URI.
 * @return {string} The Spotify URI
 * (a string on the form `spotify:album:xxxxxxxxxxxxxxxxxxxxxx`),
 * or the empty string if not available.
 */
Album.prototype.uri = function () {
  if (this.albumResponse &&
      this.albumResponse.uri) {
    return this.albumResponse.uri
  } else if (this.searchResponse &&
             this.searchResponse.albums &&
             this.searchResponse.albums.items[0] &&
             this.searchResponse.albums.items[0].uri) {
    return this.searchResponse.albums.items[0].uri
  } else if (this.id) {
    return 'spotify:album:' + this.id
  } else {
    return ''
  }
}

module.exports = Album

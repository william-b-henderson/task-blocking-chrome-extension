/** CONSTANTS */
const EVENT_SCALE_VALUE = 20;
const CALENDAR_START_TIME = 7;
let colorMapping = {};
let lastScrollPosition = 0;
let scrollTicking = false;


window.onload = function() {
    setCurrentTimeLine();
    setInterval(() => { setCurrentTimeLine(); }, 60 * 1000); //redraws the current-time line every minute
    setScrollPosition();
    chrome.identity.getAuthToken({interactive: false}, function(token) {
        if (chrome.runtime.lastError && chrome.runtime.lastError.message.match(/not signed in/)) {
            console.log("User is not signed in");
        } else {
            console.log("User is signed in");
            fetchCalendarEvents(token);
        }
        return;
    })
    window.addEventListener('scroll', function(e) {
        lastScrollPosition = window.scrollY;
        if (!scrollTicking) {
            window.requestAnimationFrame(function() {
                lastScrollPosition = window.scrollY;
                chrome.storage.local.set({ lastScrollPosition });
                scrollTicking = false;
            });
            scrollTicking = true;
        }
    });
    document.getElementById("oauth").addEventListener("click", function() {
        chrome.identity.getAuthToken({ 'interactive': true }, fetchCalendarEvents);
    });
    document.getElementById("signout").addEventListener("click", function() {
        chrome.identity.getAuthToken({ 'interactive': true }, signOut);
    });
    document.getElementById("refresh-data").addEventListener("click", function() {
        clearAllEvents();
        chrome.identity.getAuthToken({ 'interactive': true }, fetchCalendarEvents);
    });
}

/**
 * Gets the current time, and offsets the current time line onto the claendar.
 */
function setCurrentTimeLine() {
    let date = new Date();
    let currentTime = date.getHours() + date.getMinutes() / 60;
    let currentTimeLine = document.getElementById("current-time");
    currentTimeLine.style.top = `${(currentTime - CALENDAR_START_TIME) * EVENT_SCALE_VALUE * 4}px`;
}

/**
 * Gets the lastScrollPosition when the user closed the window, and resets the scroll to
 *     that point when the user reopens the window.
 */
function setScrollPosition() {
    chrome.storage.local.get("lastScrollPosition", function(result) {
        if (result.lastScrollPosition) {
            window.scrollTo(0, result.lastScrollPosition);
        }
    });
}

/**
 * Sign's the user out of the extension using Oauth.
 * @param {jwtoken} token user authentication token
 */
async function signOut(token) {
    chrome.identity.removeCachedAuthToken({ token }, async function() {
        if (chrome.runtime.lastError) {
            console.log(chrome.runtime.lastError);
        } else {
            await fetch('https://accounts.google.com/o/oauth2/revoke?token=' + token)
            .then((response) => response.json())
            .then(function(data) {
                console.log(data);
                clearEventList();
                clearEventListCache();
                console.log("Sign out successful");
            })
            .catch(function(error) {
                console.log(error);
                console.log("Sign out failed");
            });
        }
    });
}

/**
 * removes the event list from chrome storage cache.
 */
function clearEventListCache() {
    chrome.storage.sync.clear(function() {
        console.log("Event list cache cleared");
    });
}

/**
 * Clears the event list cache and the HTML.
 */
function clearAllEvents() {
    clearEventList();
    clearEventListCache();
}

/**
 * Clears the event list from the HTML.
 */
function clearEventList() {
    let eventList = document.getElementById("event-list");
    eventList.innerHTML = "";
}

/**
 * Fetch API for user's color preferences from their calendar.
 * @param {jwtoken} token user authentication token
 */
async function createColorMapping(token) {
    let init = {
        method: 'GET',
        async: true,
        headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        'contentType': 'json'
        };
    const colors = await fetch(
        'https://www.googleapis.com/calendar/v3/colors',
        init)
        .then((response) => response.json())
        .then(function(data) {
            console.log(data)
            return data.event;
        });
    colorMapping = colors;
}

/**
 * Fetchs calendar events from all user calendars
 * @param {jwtoken} token user authentication token
 * @returns list of calendar events
 */
async function fetchCalendarEvents(token) {
    if (chrome.runtime.lastError) {
        console.log(chrome.runtime.lastError.message);
    }

    if (await getEventListCache()) {
        return;
    }
    await createColorMapping(token);

    let init = {
        method: 'GET',
        async: true,
        headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
        },
        'contentType': 'json'
        };
    const calendars = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        init)
        .then((response) => response.json())
        .then(function(data) {
            console.log(data)
            return data.items;
        });
    const {startDate, endDate} = getTimes();
    
    for (let calendar in calendars) {
        console.log(calendar);
        const calendarId = calendars[calendar].id;
        console.log(calendarId);
        let events = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${startDate}&timeMax=${endDate}&singleEvents=true&orderBy=startTime`,
            init)
            .then((response) => response.json())
            .then(function(data) {
                console.log(data)
                return data.items;
            });
        for (let event in events) {
            addEventToList(event, events);
        }
    }
    cacheEventList();
}

/**
 * Formats the date to 'HH:MM am\pm' format.
 * @param {Date} date date being formatted
 * @returns {string} time in 'HH:MM am\pm' format.
 */
const formatTime = (date) => {

    let hours = date.getHours();
    let minutes = date.getMinutes();
    let ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? '0'+minutes : minutes;
    let strTime = minutes != 0 ? hours + ':' + minutes + ampm : hours + ampm;
    return strTime;
}

/**
 * Gets the start and end of the current day in ISOString format.
 * @returns an object containing {startDate, endDate} of the current day
 */
const getTimes = () => {
    let date = new Date();
    date.setHours(0, 0, 0, 0);
    let startDate = date.toISOString();
    date.setHours(23, 59, 59, 999);
    let endDate = date.toISOString();
    return { startDate, endDate };
}

/**
 * Adds an event to the HTML calendar.
 * @param {string} event Name of event
 * @param {list} events list of events
 */
const addEventToList = (event, events) => {
    console.log(events[event]);
    let li = document.createElement("li");
    let eventList = document.getElementById("event-list");
    let titleDiv = document.createElement("div");
    let startTimeDiv = document.createElement("div");
    let endTimeDiv = document.createElement("div");
    let bottomGrabBar = document.createElement("div");

    li.classList.add("event-item");
    titleDiv.classList.add("event-title");
    startTimeDiv.classList.add("event-start-time");
    endTimeDiv.classList.add("event-end-time");
    bottomGrabBar.classList.add("event-grab-bar");

    const title = events[event].summary;
    const colorId = events[event].colorId;
    const backgroundColor = colorMapping[colorId]?.background;
    const foregroundColor = colorMapping[colorId]?.foreground;
    let startTime = new Date(events[event].start.dateTime);
    let endTime = new Date(events[event].end.dateTime);
    const height = calculateHeightOfEventItem(startTime, endTime);
    const offset = calculateOffsetOfEventItem(startTime);
    startTime = formatTime(startTime);
    endTime = formatTime(endTime);
    
    titleDiv.appendChild(document.createTextNode(title));
    startTimeDiv.appendChild(document.createTextNode(startTime + " - " + endTime)); 

    li.appendChild(titleDiv);
    li.appendChild(startTimeDiv);
    li.style.height = height;
    li.style.top = offset;
    li.style.backgroundColor = backgroundColor ? backgroundColor : "#78a8f5";
    li.style.color = foregroundColor ? foregroundColor : "#1d1d1d";


    eventList.appendChild(li);
}

/**
 * Calculates the height of the event based on the length of the event.
 * @param {Date} startTime time that the event starts
 * @param {Date} endTime time that the event ends
 * @returns {string} height of the event, in pixels
 */
const calculateHeightOfEventItem = (startTime, endTime) => {
    const startTimeInHours = startTime.getHours() + startTime.getMinutes() / 60;
    const endTimeInHours = endTime.getHours() + endTime.getMinutes() / 60;
    let height = (endTimeInHours - startTimeInHours) * EVENT_SCALE_VALUE * 4;
    return height - 1 + "px";
}

/**
 * Calculates the offset of the event from the beginning of the calendar, in pixels.
 * @param {Date} startTime time the event starts
 * @returns {string} offset from the beginning of the calendar, in pixels.
 */
const calculateOffsetOfEventItem = (startTime) => {
    const startTimeInHours = startTime.getHours() + startTime.getMinutes() / 60;
    let offset = (startTimeInHours - CALENDAR_START_TIME) * EVENT_SCALE_VALUE * 4;
    return offset + "px";
}

/**
 * Caches the innerHTML of the 'event-list' div tag to the chrome storage cache.
 */
const cacheEventList = async () => {
    let eventList = document.getElementById("event-list");
    let eventListCache = eventList.innerHTML;
    await chrome.storage.sync.set({ eventListCache });
    console.log("Event list cached");
}

/**
 * Gets the event list from the cache if it is available, and sets the innerHTML of
 *     the event list to this value. Returns True if successful, false otherwise.
 * @returns {boolean} status if the eventList has been restored from the cache
 */
const getEventListCache = async () => {
    let eventListCache = "";
    let eventList = document.getElementById("event-list");
    answer = await chrome.storage.sync.get({ eventListCache })
    .then((result) => {
        if (result.eventListCache === '') {
            console.log("No eventListCache found");
            return false;
        }
        console.log(result);
        eventListCache = result.eventListCache;
        eventList.innerHTML = eventListCache;
        return true;
    });
    return answer;
}

function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => { func.apply(this, args); }, timeout);
    }
};
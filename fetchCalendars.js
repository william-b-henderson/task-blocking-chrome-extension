function fetchCalendars(init) {
    fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        init)
        .then((response) => response.json())
        .then(function(data) {
        console.log(data)
        });
}

export { fetchCalendars };
import { useEffect, useState } from "react";
import "./App.css";


// ===============================
// API HANDLER
// ===============================

const API = "/api";


async function api(endpoint, options = {}) {

    const token =
        sessionStorage.getItem("railflow-auth");


    const response = await fetch(
        `${API}${endpoint}`,
        {

            headers: {

                "Content-Type":
                "application/json",


                ...(token
                ?
                {
                    Authorization:
                    `Bearer ${token}`
                }
                :
                {}
                )

            },


            ...options

        }
    );


    const data =
        await response.json()
        .catch(
            ()=>({})
        );


    if(!response.ok){

        throw new Error(
            data.error ||
            data.message ||
            "Request failed"
        );

    }


    return data;

}







// ===============================
// MAIN APP
// ===============================


function App(){



const [route,setRoute]=useState(

    window.location.hash
    .replace("#/","")
    ||
    "login"

);



const [user,setUser]=useState(

    JSON.parse(
        sessionStorage.getItem(
            "railflow-user"
        )
    )
    ||
    null

);



const [schedule,setSchedule]=useState(null);


const [booking,setBooking]=useState(null);


const [tickets,setTickets]=useState([]);





useEffect(()=>{


function changeRoute(){


setRoute(

window.location.hash
.replace("#/","")
||
"login"

);


}



window.addEventListener(
"hashchange",
changeRoute
);



return()=>{

window.removeEventListener(
"hashchange",
changeRoute
);

};


},[]);






function navigate(page){

    window.location.hash = `#/${page}`;

}






// ===============================
// AUTH FUNCTIONS
// ===============================



async function login(email,password){


const result =
await api(

"/auth/login",

{

method:"POST",

body:JSON.stringify({

email,

password

})

}

);



sessionStorage.setItem(

"railflow-auth",

result.token

);



sessionStorage.setItem(

"railflow-user",

JSON.stringify(result.user)

);



setUser(
result.user
);



navigate("dashboard");


}







async function logout(){



try{


await api(

"/auth/logout",

{

method:"POST"

}

);


}

catch(err){

console.log(err);

}



sessionStorage.clear();


setUser(null);


navigate("login");


}







// ===============================
// MAIN LAYOUT
// ===============================


function Layout({children}){


return(


<div className="app">



<aside className="sidebar">



<div className="brand">

<span>

🚆

</span>


RailFlow


</div>





<nav>


<a href="#/dashboard">

Dashboard

</a>



<a href="#/search">

Search Train

</a>




<a href="#/tickets">

Tickets

</a>




<a href="#/profile">

Profile

</a>



{

(user?.role==="Admin" ||
user?.role==="Manager")

&&

<a href="#/admin">

Admin

</a>

}



</nav>




<button

className="logout"

onClick={logout}

>

Logout

</button>



</aside>








<section className="content">



<header>


<div>


<small>

Railway Ticket Management System

</small>


<h1>

{
route
}

</h1>


</div>




<div className="avatar">


{

user?.name
?
user.name.charAt(0)
:
"U"

}


</div>



</header>




{children}




</section>



</div>


);


}







// ===============================
// LOGIN PAGE
// ===============================


function Login(){



const [email,setEmail]=useState("");

const [password,setPassword]=useState("");

const [error,setError]=useState("");





async function submit(e){


e.preventDefault();


try{


await login(

email,

password

);


}

catch(err){

setError(
err.message
);

}


}






return(


<div className="login">



<div className="login-card">



<h1>

Login

</h1>




<form onSubmit={submit}>


<input

type="email"

placeholder="Email"

value={email}

onChange={
e=>setEmail(
e.target.value
)
}

/>




<input

type="password"

placeholder="Password"

value={password}

onChange={
e=>setPassword(
e.target.value
)
}

/>




<button className="primary">

Login

</button>



</form>



{

error &&

<p className="error">

{error}

</p>

}



<p>

New user?

<a href="#/register">

Register

</a>


</p>



</div>




<div className="login-art">


<div>

🚆

</div>


<h2>

Travel Smarter

</h2>


<p>

Manage your railway journey easily.

</p>


</div>




</div>


);


}







// ===============================
// REGISTER PAGE
// ===============================


function Register(){



const [form,setForm]=useState({

name:"",

email:"",

password:""

});



const [message,setMessage]=useState("");





async function submit(e){


e.preventDefault();


try{


await api(

"/auth/register",

{

method:"POST",

body:JSON.stringify(form)

}

);



setMessage(
"Registration successful. Login now."
);


}

catch(err){

setMessage(
err.message
);

}



}




return(


<div className="login">



<div className="login-card">



<h1>

Create Account

</h1>




<form onSubmit={submit}>


<input

placeholder="Name"

onChange={
e=>

setForm({

...form,

name:e.target.value

})

}

/>




<input

type="email"

placeholder="Email"

onChange={
e=>

setForm({

...form,

email:e.target.value

})

}

/>




<input

type="password"

placeholder="Password"

onChange={
e=>

setForm({

...form,

password:e.target.value

})

}

/>



<button className="primary">

Register

</button>



</form>



<p>

{message}

</p>



</div>



<div className="login-art">


<div>

🚆

</div>


<h2>

Join RailFlow

</h2>


<p>

Book and manage tickets easily.

</p>



</div>



</div>


);


}

// ===============================
// DASHBOARD
// ===============================


function Dashboard(){


return(

<Layout>


<div className="hero">


<div>


<span className="tag">

WELCOME BACK

</span>



<h2>

Hello {user?.name}

</h2>



<p>

Book your railway journey quickly and safely with RailFlow.

</p>



<a

className="primary"

href="#/search"

>

Search Train

</a>



</div>




<div className="hero-train">

🚆

</div>



</div>







<h3>

Quick Overview

</h3>




<div className="metrics">



<div className="metric">


<strong>

🎫

</strong>


<span>

My Tickets

</span>


</div>




<div className="metric coral">


<strong>

🚉

</strong>


<span>

Available Trains

</span>


</div>





<div className="metric">


<strong>

💳

</strong>


<span>

Payments

</span>


</div>



</div>







<div className="panels">



<div className="panel">


<h3>

Quick Actions

</h3>



<div className="actions">


<a

href="#/search"

className="secondary"

>

Find Train

</a>



<a

href="#/tickets"

className="secondary"

>

View Tickets

</a>



</div>



</div>




</div>




</Layout>


);


}









// ===============================
// SEARCH TRAIN
// ===============================


function Search(){


const [from,setFrom]=useState("");

const [to,setTo]=useState("");

const [date,setDate]=useState("");

const [results,setResults]=useState([]);

const [error,setError]=useState("");





async function search(){


try{


const data =

await api(

`/schedules/search?from=${from}&to=${to}&date=${date}`

);



setResults(data);



}

catch(err){

setError(
err.message
);

}



}





return(


<Layout>



<div className="panel">


<h2>

Search Trains

</h2>



<div className="form-grid">



<input

placeholder="From Station"

value={from}

onChange={
e=>setFrom(e.target.value)
}

/>




<input

placeholder="Destination"

value={to}

onChange={
e=>setTo(e.target.value)
}

/>




<input

type="date"

value={date}

onChange={
e=>setDate(e.target.value)
}

/>



</div>




<button

className="primary"

onClick={search}

>

Search

</button>





{

error &&

<p className="error">

{error}

</p>

}





</div>









<div className="panel">



<h3>

Available Trains

</h3>



<div className="table-wrap">


<table>


<thead>

<tr>


<th>

Train

</th>



<th>

Date

</th>



<th>

Action

</th>



</tr>


</thead>




<tbody>


{


results.map(

train=>(


<tr

key={
train.schedule_id
}

>


<td>

{

train.train_name

}

</td>



<td>

{

train.journey_date

}

</td>




<td>


<button

className="primary"

onClick={()=>{


setSchedule(train);

navigate("booking");


}}

>

Book

</button>



</td>



</tr>


)


)


}




</tbody>



</table>



</div>



</div>




</Layout>


);


}

// ===============================
// BOOKING PAGE
// ===============================


function Booking(){


const [seats,setSeats]=useState([]);

const [selectedSeat,setSelectedSeat]=useState(null);



const [passenger,setPassenger]=useState({

name:"",

email:"",

phone:"",

age:"",

gender:""

});





useEffect(()=>{


async function loadSeats(){


if(!schedule)
return;



try{


const data =

await api(

`/schedules/${schedule.schedule_id}/seats`

);



setSeats(data);



}

catch(err){

console.log(err);

}



}



loadSeats();



},[schedule]);









async function confirmBooking(){



if(!selectedSeat){

alert(
"Please select a seat"
);

return;

}



try{


const result =

await api(

"/bookings",

{

method:"POST",

body:JSON.stringify({

schedule_id:
schedule.schedule_id,


seat_avail_id:
selectedSeat,


passenger

})

}

);



setBooking(result);


navigate("payment");



}

catch(err){

alert(
err.message
);

}



}







return(


<Layout>



<div className="panel">


<h2>

Book Ticket

</h2>



<p>

Train:

<strong>

{
schedule?.train_name
}

</strong>


</p>





<h3>

Select Seat

</h3>





<div className="seat-map">


{

seats.map(

seat=>(


<button


key={
seat.seat_avail_id
}



disabled={

seat.seat_status==="BOOKED"

}




className={

selectedSeat===seat.seat_avail_id

?

"selected"

:

""

}




onClick={()=>{


setSelectedSeat(

seat.seat_avail_id

);


}}



>


{

seat.seat_no

}



</button>


)


)


}



</div>




</div>









<div className="panel">


<h3>

Passenger Information

</h3>




<div className="form-grid">



<input

placeholder="Name"

value={
passenger.name
}

onChange={

e=>

setPassenger({

...passenger,

name:e.target.value

})

}

/>





<input

placeholder="Email"

value={
passenger.email
}

onChange={

e=>

setPassenger({

...passenger,

email:e.target.value

})

}

/>





<input

placeholder="Phone"

value={
passenger.phone
}

onChange={

e=>

setPassenger({

...passenger,

phone:e.target.value

})

}

/>




<input

placeholder="Age"

type="number"

value={
passenger.age
}

onChange={

e=>

setPassenger({

...passenger,

age:e.target.value

})

}

/>




</div>





<button

className="primary"

onClick={confirmBooking}

>


Confirm Booking


</button>




</div>




</Layout>


);


}









// ===============================
// PAYMENT PAGE
// ===============================


function Payment(){



async function pay(method){



try{


await api(

"/payments",

{

method:"POST",

body:JSON.stringify({

ticket_id:
booking.ticket_id,


payment_method:
method


})

}

);



navigate("tickets");


}

catch(err){

alert(
err.message
);

}



}





return(


<Layout>



<div className="panel">


<h2>

Payment

</h2>




<p>

Amount:

<strong>

{
booking?.fare_amount

}

</strong>


</p>





<div className="payment-options">



<button

onClick={()=>pay("Card")}

>

💳 Card

</button>




<button

onClick={()=>pay("Mobile Banking")}

>

📱 Mobile Banking

</button>




<button

onClick={()=>pay("Cash")}

>

💵 Cash

</button>




</div>




</div>




</Layout>


);


}









// ===============================
// MY TICKETS
// ===============================


function Tickets(){



useEffect(()=>{


async function loadTickets(){



try{


const data =

await api(

"/bookings/my"

);



setTickets(data);



}

catch(err){

console.log(err);

}



}



loadTickets();



},[]);







return(


<Layout>




<div className="panel">


<h2>

My Tickets

</h2>





{

tickets.length===0

?

<p>

No tickets found.

</p>


:


tickets.map(

ticket=>(


<div

className="ticket-card"

key={
ticket.ticket_id
}

>




<div className="ticket-top">


<h3>

Ticket #

{
ticket.ticket_id

}


</h3>



<span>

{
ticket.ticket_status

}

</span>


</div>







<div className="ticket-route">


<p>

Train

<br/>

<strong>

{
ticket.train_name

}

</strong>


</p>




<p>

Fare

<br/>

<strong>

৳
{
ticket.fare_amount

}

</strong>


</p>



</div>







<button

className="danger"

onClick={()=>{


sessionStorage.setItem(

"cancel-ticket",

ticket.ticket_id

);


navigate("cancellation");


}}

>


Cancel Ticket


</button>






</div>


)


)


}





</div>



</Layout>


);



}


// ===============================
// CANCELLATION PAGE
// ===============================


function Cancellation(){


const [reason,setReason]=useState("");



async function cancelTicket(){


const ticketId =
sessionStorage.getItem(
"cancel-ticket"
);



if(!ticketId){

alert(
"No ticket selected"
);

return;

}



try{


await api(

`/cancellation/${ticketId}`,

{

method:"POST",

body:JSON.stringify({

reason

})

}

);



alert(
"Ticket cancelled successfully"
);



navigate("tickets");



}

catch(err){

alert(
err.message
);

}



}





return(


<Layout>



<div className="panel">


<h2>

Cancel Ticket

</h2>




<textarea

placeholder="Cancellation reason"

value={reason}

onChange={
e=>setReason(
e.target.value
)
}


/>




<button

className="danger"

onClick={cancelTicket}

>

Confirm Cancellation

</button>



</div>



</Layout>


);


}









// ===============================
// PROFILE PAGE
// ===============================


function Profile(){



return(


<Layout>



<div className="profile-layout">



<div className="profile-card">


<div className="avatar large">


{

user?.name
?
user.name.charAt(0)
:
"U"

}


</div>



<h2>

{
user?.name

}

</h2>



<p>

{
user?.email

}

</p>



<p>

Role:

<strong>

{
user?.role

}

</strong>


</p>



</div>




<div className="panel">


<h3>

Account Information

</h3>



<p>

Your account information is securely managed by RailFlow.

</p>



</div>



</div>



</Layout>


);



}









// ===============================
// ADMIN PAGE
// ===============================


function Admin(){



const [users,setUsers]=useState([]);





useEffect(()=>{


async function loadUsers(){


try{


const data =

await api(

"/admin/users"

);



setUsers(data);



}

catch(err){

console.log(err);

}



}



loadUsers();



},[]);







if(

user?.role!=="Admin"
&&
user?.role!=="Manager"

){


return(

<Layout>


<div className="panel">


<h2>

Access Denied

</h2>


<p>

You are not authorized to access this page.

</p>


</div>


</Layout>

);


}





return(


<Layout>



<div className="panel">


<h2>

Admin Management

</h2>





<div className="table-wrap">


<table>


<thead>


<tr>


<th>

Name

</th>


<th>

Email

</th>


<th>

Role

</th>


</tr>


</thead>



<tbody>



{

users.map(

item=>(


<tr

key={
item.user_id
}

>


<td>

{
item.name
}

</td>


<td>

{
item.email
}

</td>



<td>

{
item.role
}

</td>


</tr>


)


)


}



</tbody>


</table>



</div>



</div>



</Layout>


);



}









// ===============================
// ROUTER
// ===============================


function Page(){


switch(route){


case "login":

return <Login/>;



case "register":

return <Register/>;



case "dashboard":

return <Dashboard/>;



case "search":

return <Search/>;



case "booking":

return <Booking/>;



case "payment":

return <Payment/>;



case "tickets":

return <Tickets/>;



case "cancellation":

return <Cancellation/>;



case "profile":

return <Profile/>;



case "admin":

return <Admin/>;



default:

return <Login/>;



}


}







return(

<Page/>

);



}




export default App;
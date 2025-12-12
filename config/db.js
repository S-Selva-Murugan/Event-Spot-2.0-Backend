const mongoose = require('mongoose') 

const configureDB = async () => {
    try {
        const db = await mongoose.connect(`mongodb+srv://selvakvs11_db_user:gW1knHynYqBTANL3@mycluster.jfaj9lg.mongodb.net/?retryWrites=true&w=majority&appName=MyCluster`)
        console.log('connected to db')
    } catch(e) {
        console.log(e.message)
    }
}

module.exports = configureDB